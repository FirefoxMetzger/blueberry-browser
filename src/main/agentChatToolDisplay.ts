import type {
  GrepMatchCard,
  ListTabCard,
  ReadTabCard,
  ToolDisplayMessage,
} from "../tabAgent/types";

export function summarizeToolInput(
  toolName: string,
  input: Record<string, unknown>,
): string {
  switch (toolName) {
    case "list_tabs":
      return "workspace tabs";
    case "search_workspace":
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
    case "read_tab": {
      if (input.tab_id) {
        return `tab: ${String(input.tab_id)}`;
      }
      if (input.query) {
        return `query: ${String(input.query)}`;
      }
      return "active browser tab";
    }
    case "open_tab":
      return `url: ${String(input.url ?? "")}`;
    case "scroll_tab": {
      if (input.selector) {
        return `scroll to ${String(input.selector)}`;
      }
      if (input.scroll_x !== undefined || input.scroll_y !== undefined) {
        return `scroll to (${String(input.scroll_x ?? 0)}, ${String(input.scroll_y ?? 0)})`;
      }
      if (input.delta_y !== undefined || input.delta_x !== undefined) {
        return `scroll by ${String(input.delta_x ?? 0)}, ${String(input.delta_y ?? 0)}`;
      }
      return "scroll position";
    }
    case "click_tab": {
      const shiftSuffix = input.shift_key ? " (shift)" : "";
      if (input.selector) {
        return `click ${String(input.selector)}${shiftSuffix}`;
      }
      if (input.x !== undefined && input.y !== undefined) {
        return `click (${String(input.x)}, ${String(input.y)})${shiftSuffix}`;
      }
      return `click${shiftSuffix}`;
    }
    case "go_back_tab":
      return input.tab_id
        ? `tab: ${String(input.tab_id)}`
        : input.query
          ? `query: ${String(input.query)}`
          : "active browser tab";
    case "type_tab": {
      const target = input.selector
        ? String(input.selector)
        : "focused element";
      const clearNote = input.clear_first ? ", clear first" : "";
      return `type into ${target}: ${String(input.text ?? "").slice(0, 40)}${clearNote}`;
    }
    default:
      return JSON.stringify(input);
  }
}

function summarizeToolResult(toolName: string, result: unknown): string {
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
    case "search_workspace": {
      const total = Number(record.totalMatches ?? 0);
      const sources = Number(record.sourcesSearched ?? 0);
      const truncated = record.truncated ? " (truncated)" : "";
      return `${total} match${total === 1 ? "" : "es"} across ${sources} source${sources === 1 ? "" : "s"}${truncated}`;
    }
    case "screenshot":
      return `Captured ${String(record.title ?? "tab")} (${Number(record.width ?? 0)}×${Number(record.height ?? 0)})`;
    case "read_tab": {
      const chars = Number(record.charCount ?? 0);
      const truncated = record.truncated ? " (truncated)" : "";
      return `Read ${String(record.title ?? "tab")} — ${chars} chars${truncated}`;
    }
    case "open_tab": {
      const loaded = record.loaded ? "loaded" : "opened";
      return `Opened ${String(record.title ?? "tab")} (${String(record.url ?? "")}), ${loaded}`;
    }
    case "scroll_tab":
      return record.success
        ? `Scrolled ${String(record.title ?? "tab")}`
        : `Scroll failed: ${String(record.reason ?? "unknown")}`;
    case "click_tab":
      return record.success
        ? `Clicked in ${String(record.title ?? "tab")}`
        : `Click failed: ${String(record.reason ?? "unknown")}`;
    case "go_back_tab":
      return record.success
        ? `Went back in ${String(record.title ?? "tab")}`
        : `Back navigation failed: ${String(record.reason ?? "unknown")}`;
    case "type_tab":
      return record.success
        ? `Typed into ${String(record.title ?? "tab")}`
        : `Type failed: ${String(record.reason ?? "unknown")}`;
    default:
      return "Done";
  }
}

function unwrapToolResultValue(output: unknown): unknown {
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

  if (toolMessage.toolName === "search_workspace") {
    toolMessage.grepMatches = parseGrepMatchCards(unwrapped);
  }

  if (toolMessage.toolName === "read_tab") {
    toolMessage.readTabCard = parseReadTabCard(unwrapped);
  }
}

function parseReadTabCard(result: unknown): ReadTabCard | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const record = result as Record<string, unknown>;
  const tabId = String(record.tabId ?? "");
  if (!tabId) {
    return undefined;
  }

  return {
    tabId,
    title: String(record.title ?? "Untitled"),
    url: String(record.url ?? ""),
  };
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
