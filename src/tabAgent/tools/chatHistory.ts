import type {
  AgentChatEventRow,
  AgentChatMessagePayload,
  StoredTurnItem,
} from "../types";

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

function turnItemsToText(turnItems: StoredTurnItem[]): string[] {
  const lines: string[] = [];

  for (const item of turnItems) {
    if (item.role === "assistant") {
      lines.push(`[assistant]: ${item.content}`);
      continue;
    }

    lines.push(
      `[tool ${item.toolName}]: ${item.error ?? item.summary ?? item.toolName}`,
    );
  }

  return lines;
}

function messagePayloadToText(payload: AgentChatMessagePayload): string[] {
  const lines = [`[user]: ${payload.message}`];

  if (payload.turnItems?.length) {
    lines.push(...turnItemsToText(payload.turnItems));
    return lines;
  }

  if (payload.response) {
    lines.push(`[assistant]: ${payload.response}`);
  }

  return lines;
}

export function chatTextFromEventRows(
  rows: AgentChatEventRow[],
  tabId: string,
): string {
  const lines: string[] = [];

  for (const row of rows) {
    if (row.payload_type === "agent-chat-clear-chat") {
      const payload = parseClearPayload(row.payload);
      if (payload?.tabId === tabId) {
        lines.length = 0;
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

    lines.push(...messagePayloadToText(payload));
  }

  return lines.join("\n");
}
