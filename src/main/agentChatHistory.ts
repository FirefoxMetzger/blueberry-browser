import type {
  AgentChatEventRow,
  AgentChatMessagePayload,
  ChatDisplayMessage,
  StoredTurnItem,
  ToolDisplayMessage,
} from "../agentChat/types";

export type AgentCoreMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

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

function turnItemsToCoreMessages(
  turnItems: StoredTurnItem[],
): AgentCoreMessage[] {
  const messages: AgentCoreMessage[] = [];

  for (const item of turnItems) {
    if (item.role === "assistant") {
      messages.push({ role: "assistant", content: item.content });
      continue;
    }

    messages.push({
      role: "assistant",
      content: `[tool ${item.toolName}]: ${item.error ?? item.summary ?? item.toolName}`,
    });
  }

  return messages;
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

export function coreMessagesFromEventRows(
  rows: AgentChatEventRow[],
  tabId: string,
  excludeEventId?: number,
): AgentCoreMessage[] {
  const filteredRows =
    excludeEventId === undefined
      ? rows
      : rows.filter((row) => row.id !== excludeEventId);

  const messages: AgentCoreMessage[] = [];

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

    if (payload.turnItems?.length) {
      messages.push(
        ...turnItemsToCoreMessages(payload.turnItems.filter(isStoredTurnItem)),
      );
    } else if (payload.response) {
      messages.push({
        role: "assistant",
        content: payload.response,
      });
    }
  }

  return messages;
}
