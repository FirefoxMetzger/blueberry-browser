import { tool } from "ai";
import { z } from "zod";
import { grepWorkspace } from "./grep";
import { listWorkspaceTabs } from "./listTabs";
import { createReadTabTool } from "./readTab";
import { createScreenshotTool } from "./screenshot";
import {
  createClickTabTool,
  createGoBackTabTool,
  createOpenTabTool,
  createScrollTabTool,
  createTypeTabTool,
} from "./tabNavigation";
import type { AgentToolContext } from "./types";

export function createAgentTools(context: AgentToolContext) {
  return {
    list_tabs: tool({
      description:
        "List all tabs currently open in the workspace with title, URL, tab ID, and metadata. Call this before screenshot or grep when you need to know which tabs are available or how to target them.",
      inputSchema: z.object({}),
      execute: async () => listWorkspaceTabs(context),
    }),
    grep: tool({
      description:
        "Search all browser tabs and agent chats in the current workspace for a regex pattern. Returns up to 50 matches with +/- 5 lines of context and a source reference for each match.",
      inputSchema: z.object({
        pattern: z
          .string()
          .describe(
            "Regular expression pattern to search for across workspace content.",
          ),
        case_insensitive: z
          .boolean()
          .optional()
          .describe(
            "Whether to perform a case-insensitive search. Defaults to false.",
          ),
      }),
      execute: async ({ pattern, case_insensitive }) =>
        grepWorkspace(context, pattern, case_insensitive ?? false),
    }),
    screenshot: createScreenshotTool(context),
    read_tab: createReadTabTool(context),
    open_tab: createOpenTabTool(context),
    scroll_tab: createScrollTabTool(context),
    click_tab: createClickTabTool(context),
    go_back_tab: createGoBackTabTool(context),
    type_tab: createTypeTabTool(context),
  };
}
