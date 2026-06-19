import { type Tool } from "ai";
import { z } from "zod";
import { defineAgentTool } from "./defineAgentTool";
import type { AgentToolContext } from "./types";

export const name = "open_tab" as const;

interface Input {
  url: string;
}

const inputSchema = z.object({
  url: z
    .string()
    .describe(
      "URL or search query to open, e.g. 'https://example.com' or 'weather in berlin'.",
    ),
}) satisfies z.ZodType<Input>;

interface Output {
  success: boolean;
  tabId: string;
  title: string;
  url: string;
  loaded: boolean;
  returnedToChat: boolean;
}

export function create(context: AgentToolContext): Tool {
  return defineAgentTool({
    description:
      "Open a new browser tab and navigate it to a URL or search query. The user is briefly shown the new tab while it loads, then returned to this agent chat. Returns the new tab ID so follow-up tools can target it.",
    inputSchema,
    execute: async (input: Input): Promise<Output> => {
      if (!context.createBrowserTab) {
        throw new Error("Opening tabs is not available in this context.");
      }

      const agentChatTabId = context.currentChatTabId;
      const created = context.createBrowserTab(input.url);
      if (!created) {
        throw new Error(`Failed to open a new tab for "${input.url}".`);
      }

      context.switchBrowserTab?.(created.tabId);

      let materialized = context.window.getTab(created.tabId);
      if (!materialized) {
        materialized = context.ensureBrowserTab?.(created.tabId) ?? null;
      }

      let loaded = false;
      if (materialized) {
        await materialized.waitForLoad();
        loaded = !materialized.view.webContents.isLoading();
      }

      context.switchBrowserTab?.(agentChatTabId);

      return {
        success: true,
        tabId: created.tabId,
        title: materialized?.title || created.title,
        url: materialized?.url || created.url,
        loaded,
        returnedToChat: true,
      };
    },
  });
}
