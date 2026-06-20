import type {
  AgentChatEventRow,
  AgentChatMessagePayload,
  ChatDisplayMessage,
  StoredTurnItem,
} from "../../types";

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
  } catch {
    return null;
  }

  return null;
}

function parseClearPayload(raw: string): { tabId: string } | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "tabId" in parsed
    ) {
      return parsed as { tabId: string };
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
      content: item.content,
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
      content: payload.response,
      timestamp,
    },
  ];
}

export function displayMessagesFromEventRows(
  rows: AgentChatEventRow[],
  tabId: string,
): ChatDisplayMessage[] {
  const messages: ChatDisplayMessage[] = [];

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

    messages.push(...turnItemsFromPayload(payload, timestamp));
  }

  return messages;
}
