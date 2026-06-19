import type { TabSnapshot } from "../../workspaces/types";
import type { AgentToolContext, ListTabsResult } from "./types";

function screenshotQueryHint(title: string, url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
    if (host) {
      return host;
    }
  } catch {
    // fall through
  }

  return title.split(" ")[0]?.toLowerCase() || "tab";
}

function formatTabParagraph(
  tab: TabSnapshot,
  context: AgentToolContext,
): string {
  const title = tab.title.trim() || "Untitled";
  const url = tab.url.trim() || "no URL";
  const type =
    tab.kind === "browser"
      ? "browser tab"
      : tab.kind === "agent-chat"
        ? "agent chat"
        : "pending browser tab";
  const focus = tab.isActive ? " This tab is currently focused." : "";
  const materialized = context.window.getTab(tab.id);
  const loaded = Boolean(materialized);

  const lines = [
    `${title} (${type}, id: ${tab.id}).${focus}`,
    `URL: ${url}.`,
  ];

  if (tab.kind === "browser" || tab.kind === "pending") {
    const queryHint = screenshotQueryHint(title, url);
    lines.push(
      `State: ${loaded ? "loaded" : "not loaded"}. Screenshot tool: use query "${queryHint}" or tab_id "${tab.id}".`,
    );
    lines.push(
      "Navigation tools: open_tab, scroll_tab, click_tab, go_back_tab, and type_tab can target this tab by tab_id or query. read_tab returns the page as markdown.",
    );
    lines.push("search_workspace tool: searches this tab's page text.");
  } else if (tab.kind === "agent-chat") {
    const current =
      tab.id === context.currentChatTabId ? " This is the current chat." : "";
    lines.push(
      `State: conversation history.${current} search_workspace tool: searches this chat's messages. Screenshots are not available for chat tabs.`,
    );
  }

  return lines.join(" ");
}

function toTabListEntry(
  tab: TabSnapshot,
  context: AgentToolContext,
): ListTabsResult["tabs"][number] {
  const materialized = context.window.getTab(tab.id);

  return {
    id: tab.id,
    title: tab.title.trim() || "Untitled",
    url: tab.url.trim() || "no URL",
    kind: tab.kind,
    isActive: tab.isActive,
    loaded: Boolean(materialized),
    screenshotable: tab.kind === "browser" || tab.kind === "pending",
    description: formatTabParagraph(tab, context),
  };
}

export function listWorkspaceTabs(context: AgentToolContext): ListTabsResult {
  const tabs = context.getWorkspaceTabs().map((tab) => toTabListEntry(tab, context));
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
}
