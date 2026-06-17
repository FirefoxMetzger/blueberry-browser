import { tool } from "ai";
import { z } from "zod";
import TurndownService from "turndown";
import { getMaterializedTab, requireBrowserTab } from "./tabUtils";
import type { AgentToolContext, ReadTabResult } from "./types";

const MAX_MARKDOWN_CHARS = 80_000;

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

const EXTRACT_HTML_SCRIPT = `(() => {
  const root = document.body;
  if (!root) {
    return "";
  }

  const clone = root.cloneNode(true);
  clone
    .querySelectorAll("script, style, noscript, svg, iframe")
    .forEach((element) => element.remove());

  return clone.innerHTML;
})()`;

export async function readBrowserTab(
  context: AgentToolContext,
  options: { tab_id?: string; query?: string } = {},
): Promise<ReadTabResult> {
  const tab = requireBrowserTab(context, options.tab_id, options.query);
  const materialized = await getMaterializedTab(context, tab);
  await materialized.waitForLoad();

  const html = await materialized.runJs(EXTRACT_HTML_SCRIPT);
  if (typeof html !== "string") {
    throw new Error(`Failed to read page HTML from "${tab.title}".`);
  }

  let markdown = turndown.turndown(html).trim();
  const charCount = markdown.length;
  let truncated = false;

  if (markdown.length > MAX_MARKDOWN_CHARS) {
    markdown = `${markdown.slice(0, MAX_MARKDOWN_CHARS)}\n\n[truncated]`;
    truncated = true;
  }

  return {
    tabId: tab.id,
    title: materialized.title || tab.title,
    url: materialized.url || tab.url,
    markdown,
    charCount,
    truncated,
  };
}

export function createReadTabTool(context: AgentToolContext) {
  return tool({
    description:
      "Read a browser tab's page content as markdown converted from the DOM. Use tab_id or query to target a tab. Prefer this for detailed page text when grep or screenshot is insufficient.",
    inputSchema: z.object({
      tab_id: z.string().optional().describe("Exact browser tab ID to read."),
      query: z
        .string()
        .optional()
        .describe(
          "Match a browser tab by title or URL substring. Defaults to the active browser tab.",
        ),
    }),
    execute: async ({ tab_id, query }) =>
      readBrowserTab(context, { tab_id, query }),
  });
}
