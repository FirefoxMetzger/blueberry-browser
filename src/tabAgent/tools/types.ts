import type { Window } from "../../main/Window";
import type { Tab } from "../../tabBrowser/Tab";
import type { TabSnapshot } from "../../workspaces/types";

export interface AgentToolContext {
  window: Window;
  workspaceTopic: string;
  currentChatTabId: string;
  getWorkspaceTabs: () => TabSnapshot[];
  ensureBrowserTab?: (tabId: string) => Tab | null;
  createBrowserTab?: (url: string) => {
    tabId: string;
    title: string;
    url: string;
  } | null;
  switchBrowserTab?: (tabId: string) => boolean;
}
