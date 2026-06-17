import type { CoreMessage } from "ai";

export interface AgentChatMessagePayload {
  tabId: string;
  message: string;
  messageId: string;
  response?: string;
}

export interface AgentChatClearPayload {
  tabId: string;
}

export interface AgentChatEventRow {
  id: number;
  payload: string;
  payload_type: string;
  created: string;
}

export interface StoredChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

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

export function chatMessagesFromEventRows(
  rows: AgentChatEventRow[],
  tabId: string,
): StoredChatMessage[] {
  const messages: StoredChatMessage[] = [];

  for (const row of rows) {
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

    if (payload.response) {
      messages.push({
        id: `${payload.messageId}-assistant`,
        role: "assistant",
        content: payload.response,
        timestamp,
      });
    }
  }

  return messages;
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

  return chatMessagesFromEventRows(filteredRows, tabId).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}
