import { type Tool } from "ai";
import { z } from "zod";
import { defineAgentTool } from "./defineAgentTool";
import { eventDatabase } from "../../events/database";
import { AGENT_CHAT_MESSAGES_QUERY } from "../../events/queries";
import { chatTextFromEventRows } from "./chatHistory";
import { getMaterializedTab } from "./tab_utils";
import type { AgentChatEventRow } from "../types";
import type { AgentToolContext } from "./types";

export const name = "search_workspace" as const;

interface Input {
  pattern: string;
  case_insensitive?: boolean;
}

interface GrepMatch {
  source: string;
  sourceType: "browser-tab" | "agent-chat";
  tabId: string;
  title: string;
  url?: string;
  lineNumber: number;
  lineText: string;
  context: string;
}

interface Output {
  pattern: string;
  caseInsensitive: boolean;
  matches: GrepMatch[];
  totalMatches: number;
  truncated: boolean;
  sourcesSearched: number;
}

const CONTEXT_LINES = 5;
const MAX_MATCHES = 50;
const MAX_OUTPUT_CHARS = 12_000;

export function create(context: AgentToolContext): Tool {
  return defineAgentTool({
    description:
      "Search all browser tabs and agent chats in the current workspace for a regex pattern. Returns up to 50 matches with +/- 5 lines of context and a source reference for each match.",
    inputSchema: z.object({
      pattern: z
        .string()
        .min(1)
        .describe(
          "Regular expression pattern to search for across workspace content.",
        ),
      case_insensitive: z
        .boolean()
        .optional()
        .describe(
          "Whether to perform a case-insensitive search. Defaults to false.",
        ),
    }) satisfies z.ZodType<Input>,
    execute: async (input: Input): Promise<Output> => {
      const caseInsensitive = input.case_insensitive ?? false;
      const trimmedPattern = input.pattern.trim();

      if (!trimmedPattern) {
        throw new Error("pattern is required.");
      }

      let regex: RegExp;
      try {
        regex = new RegExp(trimmedPattern, caseInsensitive ? "i" : "");
      } catch {
        throw new Error(`Invalid grep pattern: ${trimmedPattern}`);
      }

      const chatEventRows = eventDatabase.query<AgentChatEventRow>(
        AGENT_CHAT_MESSAGES_QUERY,
        [context.workspaceTopic],
      );

      const sources: Array<{
        tabId: string;
        title: string;
        url?: string;
        sourceType: "browser-tab" | "agent-chat";
        text: string;
      }> = [];

      for (const tab of context.getWorkspaceTabs()) {
        if (tab.kind === "browser" || tab.kind === "pending") {
          let text: string | null = null;
          try {
            const materializedTab = await getMaterializedTab(context, tab);
            const tabText = await materializedTab.getTabText();
            text = tabText.trim() ? tabText : null;
          } catch {
            // Skip tabs that are not loaded or readable.
          }

          if (text?.trim()) {
            sources.push({
              tabId: tab.id,
              title: tab.title,
              url: tab.url,
              sourceType: "browser-tab",
              text,
            });
          }
          continue;
        }

        if (tab.kind === "agent-chat") {
          const text = chatTextFromEventRows(chatEventRows, tab.id);
          if (text.trim()) {
            sources.push({
              tabId: tab.id,
              title: tab.title || "Agent Chat",
              sourceType: "agent-chat",
              text,
            });
          }
        }
      }

      const allMatches: GrepMatch[] = [];
      const lineRegex = new RegExp(regex.source, regex.flags.replace(/g/g, ""));

      for (const source of sources) {
        const lines = source.text.split("\n");

        for (let index = 0; index < lines.length; index++) {
          if (!lineRegex.test(lines[index])) {
            continue;
          }

          const start = Math.max(0, index - CONTEXT_LINES);
          const end = Math.min(lines.length - 1, index + CONTEXT_LINES);
          const contextBlock = lines
            .slice(start, end + 1)
            .map((line, lineIndex) => {
              const lineNumber = start + lineIndex + 1;
              const marker = lineNumber === index + 1 ? ">" : " ";
              return `${marker} ${lineNumber}: ${line}`;
            })
            .join("\n");

          allMatches.push({
            source:
              source.sourceType === "browser-tab"
                ? `browser-tab:${source.tabId} | ${source.title} | ${source.url ?? "unknown"}`
                : `agent-chat:${source.tabId} | ${source.title}`,
            sourceType: source.sourceType,
            tabId: source.tabId,
            title: source.title,
            url: source.url,
            lineNumber: index + 1,
            lineText: lines[index],
            context: contextBlock,
          });
        }
      }

      const matches: GrepMatch[] = [];
      let outputChars = 0;
      let truncated = false;

      for (const match of allMatches) {
        const matchSize = match.context.length + match.source.length + 64;
        if (
          matches.length >= MAX_MATCHES ||
          outputChars + matchSize > MAX_OUTPUT_CHARS
        ) {
          truncated = true;
          break;
        }

        matches.push(match);
        outputChars += matchSize;
      }

      return {
        pattern: trimmedPattern,
        caseInsensitive,
        matches,
        totalMatches: allMatches.length,
        truncated,
        sourcesSearched: sources.length,
      };
    },
  });
}
