import type { Window } from "../../main/Window";
import type { Tab } from "../../browserTab/Tab";
import type { TabKind, TabSnapshot } from "../../workspaces/types";

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

export interface GrepMatch {
  source: string;
  sourceType: "browser-tab" | "agent-chat";
  tabId: string;
  title: string;
  url?: string;
  lineNumber: number;
  lineText: string;
  context: string;
}

export interface GrepResult {
  pattern: string;
  caseInsensitive: boolean;
  matches: GrepMatch[];
  totalMatches: number;
  truncated: boolean;
  sourcesSearched: number;
}

export interface ListTabsResult {
  workspaceTopic: string;
  tabCount: number;
  tabs: Array<{
    id: string;
    title: string;
    url: string;
    kind: TabKind;
    isActive: boolean;
    loaded: boolean;
    screenshotable: boolean;
    description: string;
  }>;
  formatted: string;
}

export interface ScreenshotResult {
  tabId: string;
  title: string;
  url: string;
  width: number;
  height: number;
  imageDataUrl: string;
}

export interface ReadTabResult {
  tabId: string;
  title: string;
  url: string;
  markdown: string;
  charCount: number;
  truncated: boolean;
}
