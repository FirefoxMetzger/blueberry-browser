import type { Tab } from "../../browserTab/Tab";
import type { TabSnapshot } from "../../workspaces/types";
import type { AgentToolContext } from "./types";

function getBrowserTabs(context: AgentToolContext): TabSnapshot[] {
  return context
    .getWorkspaceTabs()
    .filter((tab) => tab.kind === "browser" || tab.kind === "pending");
}

function resolveBrowserTab(
  context: AgentToolContext,
  tabId?: string,
  query?: string,
): TabSnapshot | null {
  const browserTabs = getBrowserTabs(context);

  if (tabId) {
    return browserTabs.find((tab) => tab.id === tabId) ?? null;
  }

  if (query?.trim()) {
    const normalized = query.trim().toLowerCase();
    return (
      browserTabs.find(
        (tab) =>
          tab.title.toLowerCase().includes(normalized) ||
          tab.url.toLowerCase().includes(normalized),
      ) ?? null
    );
  }

  const activeTab = browserTabs.find((tab) => tab.isActive);
  return activeTab ?? browserTabs[0] ?? null;
}

function formatAvailableTabs(context: AgentToolContext): string {
  const tabs = getBrowserTabs(context);
  if (tabs.length === 0) {
    return "none";
  }

  return tabs
    .map((tab) => `${tab.title} (${tab.url}) [id: ${tab.id}]`)
    .join("; ");
}

export function requireBrowserTab(
  context: AgentToolContext,
  tabId?: string,
  query?: string,
): TabSnapshot {
  const tab = resolveBrowserTab(context, tabId, query);
  if (!tab) {
    throw new Error(
      `No matching browser tab found. Available tabs: ${formatAvailableTabs(context)}`,
    );
  }
  return tab;
}

export async function getMaterializedTab(
  context: AgentToolContext,
  tab: TabSnapshot,
  options: { switchToTab?: boolean } = {},
): Promise<Tab> {
  if (options.switchToTab) {
    context.switchBrowserTab?.(tab.id);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  let materialized = context.window.getTab(tab.id);
  if (!materialized) {
    materialized = context.ensureBrowserTab?.(tab.id) ?? null;
  }
  if (!materialized) {
    throw new Error(
      `Browser tab "${tab.title}" is not loaded. Available tabs: ${formatAvailableTabs(context)}`,
    );
  }

  return materialized;
}

export interface PageActionResult {
  success: boolean;
  tabId: string;
  title: string;
  url: string;
  returnedToChat?: boolean;
  [key: string]: unknown;
}

interface RunPageActionOptions {
  returnToChat?: boolean;
  waitForLoad?: boolean;
  postActionDelayMs?: number;
}

export async function runPageAction(
  context: AgentToolContext,
  tabId: string | undefined,
  query: string | undefined,
  script: string,
  options: RunPageActionOptions = {},
): Promise<PageActionResult> {
  const agentChatTabId = context.currentChatTabId;
  const tab = requireBrowserTab(context, tabId, query);
  const materialized = await getMaterializedTab(context, tab, {
    switchToTab: true,
  });

  if (options.waitForLoad) {
    await materialized.waitForLoad();
  }

  const result = await materialized.runJs(script);

  if (options.postActionDelayMs) {
    await new Promise((resolve) =>
      setTimeout(resolve, options.postActionDelayMs),
    );
  }

  if (options.returnToChat) {
    context.switchBrowserTab?.(agentChatTabId);
  }

  const actionResult =
    result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : { success: false, reason: "script returned no result" };

  return {
    success: Boolean(actionResult.success),
    tabId: tab.id,
    title: materialized.title || tab.title,
    url: materialized.url || tab.url,
    returnedToChat: options.returnToChat ?? false,
    ...actionResult,
  };
}
