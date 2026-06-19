import { eventDatabase } from "../../events/database";
import { AGENT_CHAT_MESSAGES_QUERY } from "../../events/queries";
import { chatTextFromEventRows, type AgentChatEventRow } from "../chatHistory";
import type { TabSnapshot } from "../../workspaces/types";
import type { AgentToolContext, GrepMatch, GrepResult } from "./types";

const CONTEXT_LINES = 5;
const MAX_MATCHES = 50;
const MAX_OUTPUT_CHARS = 12_000;

interface SearchableSource {
  tabId: string;
  title: string;
  url?: string;
  sourceType: "browser-tab" | "agent-chat";
  text: string;
}

function buildContextBlock(lines: string[], matchLineIndex: number): string {
  const start = Math.max(0, matchLineIndex - CONTEXT_LINES);
  const end = Math.min(lines.length - 1, matchLineIndex + CONTEXT_LINES);

  return lines
    .slice(start, end + 1)
    .map((line, index) => {
      const lineNumber = start + index + 1;
      const marker = lineNumber === matchLineIndex + 1 ? ">" : " ";
      return `${marker} ${lineNumber}: ${line}`;
    })
    .join("\n");
}

function grepInSource(source: SearchableSource, regex: RegExp): GrepMatch[] {
  const lines = source.text.split("\n");
  const matches: GrepMatch[] = [];
  const lineRegex = new RegExp(regex.source, regex.flags.replace(/g/g, ""));

  for (let index = 0; index < lines.length; index++) {
    if (!lineRegex.test(lines[index])) {
      continue;
    }

    matches.push({
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
      context: buildContextBlock(lines, index),
    });
  }

  return matches;
}

async function loadBrowserTabText(
  context: AgentToolContext,
  tab: TabSnapshot,
): Promise<string | null> {
  if (tab.kind !== "browser" && tab.kind !== "pending") {
    return null;
  }

  let materializedTab = context.window.getTab(tab.id);
  if (!materializedTab) {
    materializedTab = context.ensureBrowserTab?.(tab.id) ?? null;
  }
  if (!materializedTab) {
    return null;
  }

  try {
    const text = await materializedTab.getTabText();
    return text.trim() ? text : null;
  } catch (error) {
    console.error(`Failed to read browser tab ${tab.id}:`, error);
    return null;
  }
}

function loadAgentChatText(
  context: AgentToolContext,
  tab: TabSnapshot,
): string | null {
  const rows = eventDatabase.query<AgentChatEventRow>(
    AGENT_CHAT_MESSAGES_QUERY,
    [context.workspaceTopic],
  );
  const text = chatTextFromEventRows(rows, tab.id);
  if (!text.trim()) {
    return null;
  }

  return text;
}

async function collectSearchableSources(
  context: AgentToolContext,
): Promise<SearchableSource[]> {
  const sources: SearchableSource[] = [];

  for (const tab of context.getWorkspaceTabs()) {
    if (tab.kind === "browser" || tab.kind === "pending") {
      const text = await loadBrowserTabText(context, tab);
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
      const text = loadAgentChatText(context, tab);
      if (text?.trim()) {
        sources.push({
          tabId: tab.id,
          title: tab.title || "Agent Chat",
          sourceType: "agent-chat",
          text,
        });
      }
    }
  }

  return sources;
}

function truncateMatches(matches: GrepMatch[]): {
  matches: GrepMatch[];
  truncated: boolean;
} {
  const limited: GrepMatch[] = [];
  let outputChars = 0;
  let truncated = false;

  for (const match of matches) {
    const matchSize = match.context.length + match.source.length + 64;
    if (
      limited.length >= MAX_MATCHES ||
      outputChars + matchSize > MAX_OUTPUT_CHARS
    ) {
      truncated = true;
      break;
    }

    limited.push(match);
    outputChars += matchSize;
  }

  return { matches: limited, truncated };
}

export async function grepWorkspace(
  context: AgentToolContext,
  pattern: string,
  caseInsensitive = false,
): Promise<GrepResult> {
  const trimmedPattern = pattern.trim();
  if (!trimmedPattern) {
    return {
      pattern: trimmedPattern,
      caseInsensitive,
      matches: [],
      totalMatches: 0,
      truncated: false,
      sourcesSearched: 0,
    };
  }

  let regex: RegExp;
  try {
    regex = new RegExp(trimmedPattern, caseInsensitive ? "i" : "");
  } catch {
    throw new Error(`Invalid grep pattern: ${trimmedPattern}`);
  }

  const sources = await collectSearchableSources(context);
  const allMatches = sources.flatMap((source) => grepInSource(source, regex));
  const { matches, truncated } = truncateMatches(allMatches);

  return {
    pattern: trimmedPattern,
    caseInsensitive,
    matches,
    totalMatches: allMatches.length,
    truncated,
    sourcesSearched: sources.length,
  };
}
