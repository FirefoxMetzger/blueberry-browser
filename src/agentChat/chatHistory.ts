import type { CoreMessage } from "ai";
import {
  sanitizeAssistantText,
  type ChatDisplayMessage,
  type GrepMatchCard,
  type ListTabCard,
  type ReadTabCard,
  type ToolDisplayMessage,
} from "./displayMessages";

export interface AgentChatMessagePayload {
  tabId: string;
  message: string;
  messageId: string;
  response?: string;
  turnItems?: StoredTurnItem[];
}

interface AgentChatClearPayload {
  tabId: string;
}

export interface AgentChatEventRow {
  id: number;
  payload: string;
  payload_type: string;
  created: string;
}

interface StoredAssistantTurnItem {
  id: string;
  role: "assistant";
  content: string;
  timestamp: number;
  isError?: boolean;
}

interface StoredToolTurnItem {
  id: string;
  role: "tool";
  toolName: string;
  status: "complete" | "error";
  input: Record<string, unknown>;
  summary?: string;
  error?: string;
  previewImageUrl?: string;
  tabCards?: ListTabCard[];
  grepMatches?: GrepMatchCard[];
  readTabCard?: ReadTabCard;
  timestamp: number;
}

export type StoredTurnItem = StoredAssistantTurnItem | StoredToolTurnItem;

function parseAgentChatMessagePayload(
  raw: string,
): AgentChatMessagePayload | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "tabId" in parsed &&
      "message" in parsed
    ) {
      return parsed as AgentChatMessagePayload;
    }

    if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === "object") {
      const legacy = parsed[0] as { message?: string; messageId?: string };
      if (typeof legacy.message === "string") {
        return {
          tabId: "",
          message: legacy.message,
          messageId: legacy.messageId ?? String(Date.now()),
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

function parseClearPayload(raw: string): AgentChatClearPayload | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "tabId" in parsed
    ) {
      return parsed as AgentChatClearPayload;
    }
  } catch {
    return null;
  }

  return null;
}

function isStoredTurnItem(value: unknown): value is StoredTurnItem {
  if (!value || typeof value !== "object" || !("role" in value)) {
    return false;
  }

  const role = (value as { role: unknown }).role;
  return role === "assistant" || role === "tool";
}

function storedTurnItemToDisplayMessage(
  item: StoredTurnItem,
): ChatDisplayMessage {
  if (item.role === "assistant") {
    return {
      id: item.id,
      role: "assistant",
      content: sanitizeAssistantText(item.content),
      timestamp: item.timestamp,
      isError: item.isError,
    };
  }

  return {
    id: item.id,
    role: "tool",
    toolName: item.toolName,
    status: item.status,
    input: item.input,
    summary: item.summary,
    error: item.error,
    previewImageUrl: item.previewImageUrl,
    tabCards: item.tabCards,
    grepMatches: item.grepMatches,
    readTabCard: item.readTabCard,
    timestamp: item.timestamp,
  };
}

export function serializeTurnItems(
  turnItems: ChatDisplayMessage[],
): StoredTurnItem[] {
  return turnItems
    .filter((item) => item.role !== "user")
    .map((item) => {
      if (item.role === "assistant") {
        return {
          id: item.id,
          role: "assistant",
          content: item.content,
          timestamp: item.timestamp,
          isError: item.isError,
        };
      }

      const toolItem = item as ToolDisplayMessage;
      return {
        id: toolItem.id,
        role: "tool",
        toolName: toolItem.toolName,
        status: toolItem.status === "error" ? "error" : "complete",
        input: toolItem.input,
        summary: toolItem.summary,
        error: toolItem.error,
        previewImageUrl: toolItem.previewImageUrl,
        tabCards: toolItem.tabCards,
        grepMatches: toolItem.grepMatches,
        readTabCard: toolItem.readTabCard,
        timestamp: toolItem.timestamp,
      };
    });
}

function turnItemsFromPayload(
  payload: AgentChatMessagePayload,
  timestamp: number,
): ChatDisplayMessage[] {
  if (payload.turnItems?.length) {
    return payload.turnItems
      .filter(isStoredTurnItem)
      .map(storedTurnItemToDisplayMessage);
  }

  if (!payload.response) {
    return [];
  }

  return [
    {
      id: `${payload.messageId}-assistant`,
      role: "assistant",
      content: sanitizeAssistantText(payload.response),
      timestamp,
    },
  ];
}

export function displayMessagesFromEventRows(
  rows: AgentChatEventRow[],
  tabId: string,
  excludeEventId?: number,
): ChatDisplayMessage[] {
  const filteredRows =
    excludeEventId === undefined
      ? rows
      : rows.filter((row) => row.id !== excludeEventId);

  const messages: ChatDisplayMessage[] = [];

  for (const row of filteredRows) {
    if (row.payload_type === "agent-chat-clear-chat") {
      const payload = parseClearPayload(row.payload);
      if (payload?.tabId === tabId) {
        messages.length = 0;
      }
      continue;
    }

    if (row.payload_type !== "agent-chat-message") {
      continue;
    }

    const payload = parseAgentChatMessagePayload(row.payload);
    if (!payload || payload.tabId !== tabId) {
      continue;
    }

    const timestamp = Date.parse(row.created) || Date.now();

    messages.push({
      id: `${payload.messageId}-user`,
      role: "user",
      content: payload.message,
      timestamp,
    });

    messages.push(...turnItemsFromPayload(payload, timestamp));
  }

  return messages;
}

export function chatTextFromEventRows(
  rows: AgentChatEventRow[],
  tabId: string,
): string {
  return displayMessagesFromEventRows(rows, tabId)
    .map((message) => {
      if (message.role === "user") {
        return `[user]: ${message.content}`;
      }
      if (message.role === "assistant") {
        return `[assistant]: ${message.content}`;
      }
      return `[tool ${message.toolName}]: ${message.error ?? message.summary ?? message.toolName}`;
    })
    .join("\n");
}

export function coreMessagesFromEventRows(
  rows: AgentChatEventRow[],
  tabId: string,
  excludeEventId?: number,
): CoreMessage[] {
  const filteredRows =
    excludeEventId === undefined
      ? rows
      : rows.filter((row) => row.id !== excludeEventId);

  const messages: CoreMessage[] = [];

  for (const row of filteredRows) {
    if (row.payload_type === "agent-chat-clear-chat") {
      const payload = parseClearPayload(row.payload);
      if (payload?.tabId === tabId) {
        messages.length = 0;
      }
      continue;
    }

    if (row.payload_type !== "agent-chat-message") {
      continue;
    }

    const payload = parseAgentChatMessagePayload(row.payload);
    if (!payload || payload.tabId !== tabId) {
      continue;
    }

    messages.push({
      role: "user",
      content: payload.message,
    });

    if (payload.response) {
      messages.push({
        role: "assistant",
        content: sanitizeAssistantText(payload.response),
      });
    }
  }

  return messages;
}
