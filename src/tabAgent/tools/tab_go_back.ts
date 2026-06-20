import { type Tool } from "ai";
import { z } from "zod";
import { defineAgentTool } from "./defineAgentTool";
import { getMaterializedTab, requireBrowserTab } from "./tab_utils";
import type { AgentToolContext } from "./types";

export const name = "go_back_tab" as const;

interface Input {
  tab_id?: string;
  query?: string;
}

interface Output {
  success: boolean;
  tabId: string;
  title: string;
  url: string;
  reason?: string;
}

export function create(context: AgentToolContext): Tool {
  return defineAgentTool({
    description: "Navigate backward one step in a browser tab's history.",
    inputSchema: z.object({
      tab_id: z.string().optional().describe("Exact browser tab ID to target."),
      query: z
        .string()
        .optional()
        .describe(
          "Match a browser tab by title or URL substring. Defaults to the active browser tab.",
        ),
    }) satisfies z.ZodType<Input>,
    execute: async (input: Input): Promise<Output> => {
      const tab = requireBrowserTab(context, input.tab_id, input.query);
      const materialized = await getMaterializedTab(context, tab, {
        switchToTab: true,
      });

      const canGoBack =
        materialized.view.webContents.navigationHistory.canGoBack();
      if (!canGoBack) {
        return {
          success: false,
          tabId: tab.id,
          title: materialized.title || tab.title,
          url: materialized.url || tab.url,
          reason: "tab has no back history",
        };
      }

      materialized.goBack();
      await new Promise((resolve) => setTimeout(resolve, 400));

      return {
        success: true,
        tabId: tab.id,
        title: materialized.title || tab.title,
        url: materialized.url || tab.url,
      };
    },
  });
}
