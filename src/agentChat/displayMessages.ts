export interface UserDisplayMessage {
  id: string;
  role: "user";
  content: string;
  timestamp: number;
}

export interface AssistantDisplayMessage {
  id: string;
  role: "assistant";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  isError?: boolean;
}

export interface ListTabCard {
  id: string;
  title: string;
  url: string;
  kind: "browser" | "agent-chat" | "pending";
  isActive?: boolean;
}

export interface GrepMatchCard {
  id: string;
  sourceType: "browser-tab" | "agent-chat";
  tabId: string;
  title: string;
  url?: string;
  lineNumber: number;
  lineText: string;
  pattern: string;
  caseInsensitive: boolean;
}

export interface ToolDisplayMessage {
  id: string;
  role: "tool";
  toolName: string;
  status: "running" | "complete" | "error";
  input: Record<string, unknown>;
  summary?: string;
  error?: string;
  previewImageUrl?: string;
  tabCards?: ListTabCard[];
  grepMatches?: GrepMatchCard[];
  timestamp: number;
}

export type ChatDisplayMessage =
  | UserDisplayMessage
  | AssistantDisplayMessage
  | ToolDisplayMessage;

export function summarizeToolInput(
  toolName: string,
  input: Record<string, unknown>,
): string {
  switch (toolName) {
    case "list_tabs":
      return "workspace tabs";
    case "grep":
      return `pattern: ${String(input.pattern ?? "")}`;
    case "screenshot": {
      if (input.tab_id) {
        return `tab: ${String(input.tab_id)}`;
      }
      if (input.query) {
        return `query: ${String(input.query)}`;
      }
      return "active browser tab";
    }
    default:
      return JSON.stringify(input);
  }
}

export function summarizeToolResult(
  toolName: string,
  result: unknown,
): string {
  const value = unwrapToolResultValue(result);
  if (!value || typeof value !== "object") {
    return "Done";
  }

  const record = value as Record<string, unknown>;

  switch (toolName) {
    case "list_tabs": {
      const count = Number(record.tabCount ?? 0);
      return `${count} tab${count === 1 ? "" : "s"} listed`;
    }
    case "grep": {
      const total = Number(record.totalMatches ?? 0);
      const sources = Number(record.sourcesSearched ?? 0);
      const truncated = record.truncated ? " (truncated)" : "";
      return `${total} match${total === 1 ? "" : "es"} across ${sources} source${sources === 1 ? "" : "s"}${truncated}`;
    }
    case "screenshot":
      return `Captured ${String(record.title ?? "tab")} (${Number(record.width ?? 0)}×${Number(record.height ?? 0)})`;
    default:
      return "Done";
  }
}

export function unwrapToolResultValue(output: unknown): unknown {
  if (!output || typeof output !== "object") {
    return output;
  }

  if ("type" in output && "value" in output) {
    const wrapped = output as { type: string; value: unknown };
    if (wrapped.type === "json" || wrapped.type === "text") {
      return wrapped.value;
    }
    if (wrapped.type === "error-text") {
      return { type: "error", error: wrapped.value };
    }
  }

  return output;
}

export function applyToolResultToDisplayMessage(
  toolMessage: ToolDisplayMessage,
  output: unknown,
): void {
  const unwrapped = unwrapToolResultValue(output);
  const errorMessage =
    typeof unwrapped === "object" &&
    unwrapped !== null &&
    "type" in unwrapped &&
    unwrapped.type === "error" &&
    "error" in unwrapped &&
    typeof unwrapped.error === "string"
      ? unwrapped.error
      : undefined;

  if (errorMessage) {
    toolMessage.status = "error";
    toolMessage.error = errorMessage;
    return;
  }

  toolMessage.status = "complete";
  toolMessage.summary = summarizeToolResult(toolMessage.toolName, unwrapped);

  if (
    toolMessage.toolName === "screenshot" &&
    unwrapped &&
    typeof unwrapped === "object" &&
    "imageDataUrl" in unwrapped &&
    typeof unwrapped.imageDataUrl === "string"
  ) {
    toolMessage.previewImageUrl = unwrapped.imageDataUrl;
  }

  if (toolMessage.toolName === "list_tabs") {
    toolMessage.tabCards = parseListTabCards(unwrapped);
  }

  if (toolMessage.toolName === "grep") {
    toolMessage.grepMatches = parseGrepMatchCards(unwrapped);
  }
}

function parseListTabCards(result: unknown): ListTabCard[] | undefined {
  if (!result || typeof result !== "object" || !("tabs" in result)) {
    return undefined;
  }

  const tabs = (result as { tabs?: unknown }).tabs;
  if (!Array.isArray(tabs)) {
    return undefined;
  }

  const cards: ListTabCard[] = [];
  for (const tab of tabs) {
    if (!tab || typeof tab !== "object" || !("id" in tab)) {
      continue;
    }

    const entry = tab as Record<string, unknown>;
    const kind = entry.kind;
    if (kind !== "browser" && kind !== "agent-chat" && kind !== "pending") {
      continue;
    }

    cards.push({
      id: String(entry.id),
      title: String(entry.title ?? "Untitled"),
      url: String(entry.url ?? ""),
      kind,
      isActive: Boolean(entry.isActive),
    });
  }

  return cards.length > 0 ? cards : undefined;
}

function parseGrepMatchCards(result: unknown): GrepMatchCard[] | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const record = result as Record<string, unknown>;
  const matches = record.matches;
  const pattern = String(record.pattern ?? "");
  const caseInsensitive = Boolean(record.caseInsensitive);

  if (!Array.isArray(matches) || matches.length === 0) {
    return undefined;
  }

  const cards: GrepMatchCard[] = [];
  matches.forEach((match, index) => {
    if (!match || typeof match !== "object") {
      return;
    }

    const entry = match as Record<string, unknown>;
    const sourceType = entry.sourceType;
    if (sourceType !== "browser-tab" && sourceType !== "agent-chat") {
      return;
    }

    const tabId = String(entry.tabId ?? "");
    if (!tabId) {
      return;
    }

    cards.push({
      id: `${tabId}-${String(entry.lineNumber ?? index)}-${index}`,
      sourceType,
      tabId,
      title: String(entry.title ?? "Untitled"),
      url: entry.url ? String(entry.url) : undefined,
      lineNumber: Number(entry.lineNumber ?? 0),
      lineText: String(entry.lineText ?? ""),
      pattern,
      caseInsensitive,
    });
  });

  return cards.length > 0 ? cards : undefined;
}

export function sanitizeAssistantText(text: string): string {
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<tool_response>[\s\S]*?<\/tool_response>/gi, "")
    .replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/gi, "[image]")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
