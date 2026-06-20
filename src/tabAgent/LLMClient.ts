import { WebContents } from "electron";
import {
  streamText,
  stepCountIs,
  type LanguageModel,
  type CoreMessage,
  type ToolSet,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { is } from "@electron-toolkit/utils";
import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "path";
import type { Window } from "../main/Window";
import type { Tab } from "../tabBrowser/Tab";
import type { TabSnapshot } from "../workspaces/types";
import { eventDatabase } from "../events/database";
import { AGENT_CHAT_MESSAGES_QUERY } from "../events/queries";
import {
  coreMessagesFromEventRows,
  displayMessagesFromEventRows,
  serializeTurnItems,
} from "../main/agentChatHistory";
import type {
  AgentChatEventRow,
  AgentChatMessagePayload,
  AssistantDisplayMessage,
  ChatDisplayMessage,
  ChatRequest,
  ToolDisplayMessage,
} from "./types";
import {
  applyToolResultToDisplayMessage,
  summarizeToolInput,
} from "../main/agentChatToolDisplay";
import { createAgentTools } from "./tools";
import type { AgentToolContext } from "./tools/types";

dotenv.config({ path: join(__dirname, "../../.env") });

let cachedAgentInstructions: string | null = null;

function loadAgentInstructions(): string {
  if (cachedAgentInstructions !== null) {
    return cachedAgentInstructions;
  }

  const filePath = is.dev
    ? join(__dirname, "../../src/tabAgent/instructions.md")
    : join(__dirname, "instructions.md");

  cachedAgentInstructions = readFileSync(filePath, "utf-8").trim();
  return cachedAgentInstructions;
}

type LLMProvider = "openai" | "anthropic";

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: "gpt-5.4-mini",
  anthropic: "claude-sonnet-4-6",
};

const DEFAULT_TEMPERATURE = 0.7;
const MAX_AGENT_STEPS = 75;

export class LLMClient {
  private readonly webContents: WebContents;
  private readonly tabId: string;
  private window: Window | null = null;
  private getWorkspaceTopic: (() => string | null) | null = null;
  private getWorkspaceTabs: (() => TabSnapshot[]) | null = null;
  private ensureBrowserTab: ((tabId: string) => Tab | null) | null = null;
  private createBrowserTab:
    | ((url: string) => { tabId: string; title: string; url: string } | null)
    | null = null;
  private switchBrowserTab: ((tabId: string) => boolean) | null = null;
  private readonly provider: LLMProvider;
  private readonly modelName: string;
  private readonly model: LanguageModel | null;
  private messages: CoreMessage[] = [];
  private displayMessages: ChatDisplayMessage[] = [];

  constructor(webContents: WebContents, tabId: string) {
    this.webContents = webContents;
    this.tabId = tabId;
    this.provider = this.getProvider();
    this.modelName = this.getModelName();
    this.model = this.initializeModel();

    if (this.model) {
      console.log(
        `✅ LLM Client initialized with ${this.provider} provider using model: ${this.modelName}`,
      );
    } else {
      const keyName =
        this.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
      console.error(
        `❌ LLM Client initialization failed: ${keyName} not found in environment variables.\n` +
          `Please add your API key to the .env file in the project root.`,
      );
    }
  }

  setWindow(window: Window): void {
    this.window = window;
  }

  setWorkspaceTopicResolver(resolver: () => string | null): void {
    this.getWorkspaceTopic = resolver;
  }

  setWorkspaceTabsResolver(resolver: () => TabSnapshot[]): void {
    this.getWorkspaceTabs = resolver;
  }

  setEnsureBrowserTabResolver(resolver: (tabId: string) => Tab | null): void {
    this.ensureBrowserTab = resolver;
  }

  setCreateBrowserTabResolver(
    resolver: (
      url: string,
    ) => { tabId: string; title: string; url: string } | null,
  ): void {
    this.createBrowserTab = resolver;
  }

  setSwitchBrowserTabResolver(resolver: (tabId: string) => boolean): void {
    this.switchBrowserTab = resolver;
  }

  hydrateFromDatabase(excludeEventId?: number): void {
    const topic = this.getWorkspaceTopic?.();
    if (!topic) {
      return;
    }

    const rows = eventDatabase.query<AgentChatEventRow>(
      AGENT_CHAT_MESSAGES_QUERY,
      [topic],
    );
    this.messages = coreMessagesFromEventRows(rows, this.tabId, excludeEventId);
    this.displayMessages = displayMessagesFromEventRows(
      rows,
      this.tabId,
      excludeEventId,
    );
  }

  private getProvider(): LLMProvider {
    const provider = process.env.LLM_PROVIDER?.toLowerCase();
    if (provider === "anthropic") return "anthropic";
    return "openai";
  }

  private getModelName(): string {
    return process.env.LLM_MODEL || DEFAULT_MODELS[this.provider];
  }

  private initializeModel(): LanguageModel | null {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;

    switch (this.provider) {
      case "anthropic":
        return anthropic(this.modelName);
      case "openai":
        return openai(this.modelName);
    }
  }

  private getApiKey(): string | undefined {
    switch (this.provider) {
      case "anthropic":
        return process.env.ANTHROPIC_API_KEY;
      case "openai":
        return process.env.OPENAI_API_KEY;
    }
  }

  async sendChatMessage(request: ChatRequest, eventId?: number): Promise<void> {
    if (this.messages.length === 0) {
      this.hydrateFromDatabase(eventId);
    }

    const userMessage: CoreMessage = {
      role: "user",
      content: request.message,
    };

    this.messages.push(userMessage);
    this.displayMessages.push({
      id: `${request.messageId}-user`,
      role: "user",
      content: request.message,
      timestamp: Date.now(),
    });
    this.sendMessagesToRenderer();

    if (!this.model) {
      this.sendErrorMessage(
        request.messageId,
        "LLM service is not configured. Please add your API key to the .env file.",
      );
      return;
    }

    const systemMessage: CoreMessage = {
      role: "system",
      content: loadAgentInstructions(),
    };

    await this.streamResponse(
      [systemMessage, ...this.messages],
      request.messageId,
      eventId,
    );
  }

  clearMessages(): void {
    this.messages = [];
    this.displayMessages = [];
    this.sendMessagesToRenderer();
  }

  getMessages(): CoreMessage[] {
    return this.messages;
  }

  private sendMessagesToRenderer(): void {
    this.webContents.send("chat-messages-updated", this.displayMessages);
  }

  private buildToolContext(): AgentToolContext | null {
    if (!this.window) {
      return null;
    }

    const workspaceTopic = this.getWorkspaceTopic?.();
    if (!workspaceTopic || !this.getWorkspaceTabs) {
      return null;
    }

    return {
      window: this.window,
      workspaceTopic,
      currentChatTabId: this.tabId,
      getWorkspaceTabs: this.getWorkspaceTabs,
      ensureBrowserTab: this.ensureBrowserTab ?? undefined,
      createBrowserTab: this.createBrowserTab ?? undefined,
      switchBrowserTab: this.switchBrowserTab ?? undefined,
    };
  }

  private async streamResponse(
    messages: CoreMessage[],
    messageId: string,
    eventId?: number,
  ): Promise<void> {
    const toolContext = this.buildToolContext();
    const tools: ToolSet | undefined = toolContext
      ? createAgentTools(toolContext)
      : undefined;
    const turnStartIndex = this.displayMessages.length;
    let errorAssistantDisplayId = `${messageId}-assistant-0`;

    try {
      const result = streamText<ToolSet>({
        model: this.model!,
        messages,
        tools,
        stopWhen: stepCountIs(MAX_AGENT_STEPS),
        temperature: DEFAULT_TEMPERATURE,
        maxRetries: 3,
      });

      errorAssistantDisplayId = await this.processAgentStream(
        result.fullStream,
        result.text,
        messageId,
        turnStartIndex,
        eventId,
      );
    } catch (error) {
      this.handleStreamError(
        error,
        messageId,
        eventId,
        errorAssistantDisplayId,
      );
    }
  }

  private syncTurnDisplay(
    turnStartIndex: number,
    turnItems: ChatDisplayMessage[],
  ): void {
    this.displayMessages = [
      ...this.displayMessages.slice(0, turnStartIndex),
      ...turnItems,
    ];
    this.sendMessagesToRenderer();
  }

  private async processAgentStream(
    fullStream: AsyncIterable<{
      type: string;
      text?: string;
      toolCallId?: string;
      toolName?: string;
      input?: unknown;
      output?: unknown;
      error?: unknown;
    }>,
    getFinalText: PromiseLike<string>,
    messageId: string,
    turnStartIndex: number,
    eventId?: number,
  ): Promise<string> {
    const turnItems: ChatDisplayMessage[] = [];
    let assistantSegmentIndex = 0;
    let currentAssistantId: string | null = null;
    let streamedText = "";

    const getOrCreateAssistantSegment = (): AssistantDisplayMessage => {
      const last = turnItems[turnItems.length - 1];
      if (
        currentAssistantId &&
        last?.role === "assistant" &&
        last.id === currentAssistantId
      ) {
        return last;
      }

      currentAssistantId = `${messageId}-assistant-${assistantSegmentIndex++}`;
      const segment: AssistantDisplayMessage = {
        id: currentAssistantId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isStreaming: true,
      };
      turnItems.push(segment);
      return segment;
    };

    const findToolMessage = (
      toolCallId: string,
    ): ToolDisplayMessage | undefined => {
      const match = turnItems.find(
        (message): message is ToolDisplayMessage =>
          message.role === "tool" && message.id === toolCallId,
      );
      return match;
    };

    for await (const part of fullStream) {
      switch (part.type) {
        case "text-delta": {
          if (!part.text) {
            break;
          }

          const segment = getOrCreateAssistantSegment();
          segment.content = segment.content + part.text;
          streamedText += part.text;
          this.syncTurnDisplay(turnStartIndex, turnItems);
          break;
        }
        case "tool-call": {
          if (!part.toolCallId || !part.toolName) {
            break;
          }

          currentAssistantId = null;
          const last = turnItems[turnItems.length - 1];
          if (last?.role === "assistant" && !last.content.trim()) {
            turnItems.pop();
          }

          const input =
            typeof part.input === "object" && part.input !== null
              ? (part.input as Record<string, unknown>)
              : {};

          turnItems.push({
            id: part.toolCallId,
            role: "tool",
            toolName: part.toolName,
            status: "running",
            input,
            summary: summarizeToolInput(part.toolName, input),
            timestamp: Date.now(),
          });
          this.syncTurnDisplay(turnStartIndex, turnItems);
          break;
        }
        case "tool-result": {
          if (!part.toolCallId) {
            break;
          }

          const toolMessage = findToolMessage(part.toolCallId);
          if (!toolMessage) {
            break;
          }

          applyToolResultToDisplayMessage(toolMessage, part.output);
          currentAssistantId = null;
          this.syncTurnDisplay(turnStartIndex, turnItems);
          break;
        }
        case "tool-error": {
          if (!part.toolCallId) {
            break;
          }

          const toolMessage = findToolMessage(part.toolCallId);
          if (!toolMessage) {
            break;
          }

          toolMessage.status = "error";
          toolMessage.error =
            typeof part.error === "string"
              ? part.error
              : "Tool execution failed";
          currentAssistantId = null;
          this.syncTurnDisplay(turnStartIndex, turnItems);
          break;
        }
        case "start-step": {
          currentAssistantId = null;
          break;
        }
      }
    }

    for (const item of turnItems) {
      if (item.role === "assistant") {
        item.isStreaming = false;
      }
    }

    const finalText = streamedText || (await getFinalText);

    if (!streamedText && finalText) {
      turnItems.push({
        id: `${messageId}-assistant-${assistantSegmentIndex}`,
        role: "assistant",
        content: finalText,
        timestamp: Date.now(),
        isStreaming: false,
      });
    }

    this.messages.push({
      role: "assistant",
      content: finalText,
    });

    this.syncTurnDisplay(turnStartIndex, turnItems);
    this.persistTurn(eventId, finalText, turnItems);

    const lastAssistant = [...turnItems]
      .reverse()
      .find(
        (item): item is AssistantDisplayMessage => item.role === "assistant",
      );

    return lastAssistant?.id ?? `${messageId}-assistant-0`;
  }

  private handleStreamError(
    error: unknown,
    messageId: string,
    eventId?: number,
    assistantDisplayId?: string,
  ): void {
    console.error("Error streaming from LLM:", error);

    const errorMessage = this.getErrorMessage(error);
    this.sendErrorMessage(messageId, errorMessage, eventId, assistantDisplayId);
  }

  private getErrorMessage(error: unknown): string {
    if (error && typeof error === "object" && "data" in error) {
      const data = (error as { data?: unknown }).data;
      if (data && typeof data === "object" && "error" in data) {
        const apiError = (data as { error?: unknown }).error;
        if (
          apiError &&
          typeof apiError === "object" &&
          "message" in apiError &&
          typeof apiError.message === "string"
        ) {
          return `API error: ${apiError.message}`;
        }
      }
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return "Sorry, I encountered an error while processing your request. Please try again.";
  }

  private sendErrorMessage(
    messageId: string,
    errorMessage: string,
    eventId?: number,
    assistantDisplayId?: string,
  ): void {
    const assistantDisplay = assistantDisplayId
      ? this.displayMessages.find(
          (message) => message.id === assistantDisplayId,
        )
      : undefined;

    if (assistantDisplay?.role === "assistant") {
      assistantDisplay.content = errorMessage;
      assistantDisplay.isStreaming = false;
      assistantDisplay.isError = true;
    } else {
      this.displayMessages.push({
        id: `${messageId}-assistant-error`,
        role: "assistant",
        content: errorMessage,
        timestamp: Date.now(),
        isError: true,
      });
    }

    this.sendMessagesToRenderer();

    const userIndex = this.displayMessages.findIndex(
      (message) => message.id === `${messageId}-user`,
    );
    const turnItems =
      userIndex < 0 ? [] : this.displayMessages.slice(userIndex + 1);

    this.persistTurn(eventId, errorMessage, turnItems);
  }

  private persistTurn(
    eventId: number | undefined,
    response: string,
    turnItems: ChatDisplayMessage[],
  ): void {
    if (eventId === undefined) {
      return;
    }

    const rows = eventDatabase.query<{ payload: string }>(
      "SELECT payload FROM events WHERE id = ?",
      [eventId],
    );
    const existing = rows[0]?.payload;
    if (!existing) {
      throw new Error(`Missing agent chat event payload for id ${eventId}`);
    }

    const parsed = JSON.parse(existing) as AgentChatMessagePayload;
    if (!parsed.tabId || !parsed.messageId) {
      throw new Error(`Invalid agent chat event payload for id ${eventId}`);
    }

    eventDatabase.updatePayload(eventId, {
      ...parsed,
      response,
      turnItems: serializeTurnItems(turnItems),
    });
  }
}
