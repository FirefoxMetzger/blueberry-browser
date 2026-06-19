import { type Tool } from "ai";
import { z } from "zod";
import { defineAgentTool } from "./defineAgentTool";
import type { TabKind } from "../../workspaces/types";
import type { AgentToolContext } from "./types";

export const name = "list_tabs" as const;

interface Input {}

const inputSchema = z.object({}) satisfies z.ZodType<Input>;

interface TabEntry {
  id: string;
  title: string;
  url: string;
  kind: TabKind;
  isActive: boolean;
  loaded: boolean;
  screenshotable: boolean;
  description: string;
}

interface Output {
  workspaceTopic: string;
  tabCount: number;
  tabs: TabEntry[];
  formatted: string;
}

export function create(context: AgentToolContext): Tool {
  return defineAgentTool({
    description:
      "List all tabs currently open in the workspace with title, URL, tab ID, and metadata. Call this before screenshot or search_workspace when you need to know which tabs are available or how to target them.",
    inputSchema,
    execute: async (): Promise<Output> => {
      const tabs = context.getWorkspaceTabs().map((tab) => {
        const materialized = context.window.getTab(tab.id);
        const title = tab.title.trim() || "Untitled";
        const url = tab.url.trim() || "no URL";
        const type =
          tab.kind === "browser"
            ? "browser tab"
            : tab.kind === "agent-chat"
              ? "agent chat"
              : "pending browser tab";
        const focus = tab.isActive ? " This tab is currently focused." : "";
        const loaded = Boolean(materialized);

        const lines = [
          `${title} (${type}, id: ${tab.id}).${focus}`,
          `URL: ${url}.`,
        ];

        if (tab.kind === "browser" || tab.kind === "pending") {
          let queryHint = title.split(" ")[0]?.toLowerCase() || "tab";
          try {
            const host = new URL(url).hostname
              .replace(/^www\./, "")
              .split(".")[0];
            if (host) {
              queryHint = host;
            }
          } catch {
            // fall through
          }

          lines.push(
            `State: ${loaded ? "loaded" : "not loaded"}. Screenshot tool: use query "${queryHint}" or tab_id "${tab.id}".`,
          );
          lines.push(
            "Navigation tools: open_tab, scroll_tab, click_tab, go_back_tab, and type_tab can target this tab by tab_id or query. read_tab returns the page as markdown.",
          );
          lines.push("search_workspace tool: searches this tab's page text.");
        } else if (tab.kind === "agent-chat") {
          const current =
            tab.id === context.currentChatTabId
              ? " This is the current chat."
              : "";
          lines.push(
            `State: conversation history.${current} search_workspace tool: searches this chat's messages. Screenshots are not available for chat tabs.`,
          );
        }

        return {
          id: tab.id,
          title,
          url,
          kind: tab.kind,
          isActive: tab.isActive,
          loaded,
          screenshotable: tab.kind === "browser" || tab.kind === "pending",
          description: lines.join(" "),
        };
      });

      const formatted =
        tabs.length === 0
          ? "No tabs are currently open in this workspace."
          : tabs.map((tab) => tab.description).join("\n\n");

      return {
        workspaceTopic: context.workspaceTopic,
        tabCount: tabs.length,
        tabs,
        formatted,
      };
    },
  });
}
