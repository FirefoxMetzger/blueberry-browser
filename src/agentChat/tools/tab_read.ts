import { type Tool } from "ai";
import { z } from "zod";
import TurndownService from "turndown";
import { defineAgentTool } from "./defineAgentTool";
import { getMaterializedTab, requireBrowserTab } from "./tab_utils";
import type { AgentToolContext } from "./types";

export const name = "read_tab" as const;

interface Input {
  tab_id?: string;
  query?: string;
}

const inputSchema = z.object({
  tab_id: z.string().optional().describe("Exact browser tab ID to read."),
  query: z
    .string()
    .optional()
    .describe(
      "Match a browser tab by title or URL substring. Defaults to the active browser tab.",
    ),
}) satisfies z.ZodType<Input>;

interface Output {
  tabId: string;
  title: string;
  url: string;
  markdown: string;
  charCount: number;
  truncated: boolean;
}

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

export function create(context: AgentToolContext): Tool {
  return defineAgentTool({
    description:
      "Read a browser tab's page content as markdown converted from the DOM. Use tab_id or query to target a tab. Prefer this for detailed page text when search_workspace or screenshot is insufficient.",
    inputSchema,
    execute: async (input: Input): Promise<Output> => {
      const tab = requireBrowserTab(context, input.tab_id, input.query);
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
    },
  });
}
