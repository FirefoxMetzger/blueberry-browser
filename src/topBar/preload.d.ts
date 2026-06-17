import { ElectronAPI } from "@electron-toolkit/preload";

interface TabInfo {
  id: string;
  title: string;
  url: string;
  kind: "browser" | "agent-chat" | "pending";
  isActive: boolean;
  workspaceId: string;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  topic: string;
  tabCount: number;
  isDefault: boolean;
  isActive?: boolean;
}

interface WorkspaceSnapshot {
  workspaces: WorkspaceInfo[];
  activeWorkspaceId: string;
  tabs: TabInfo[];
  contextDashboardVisible: boolean;
}

interface PopupPoint {
  x: number;
  y: number;
}

interface TopBarAPI {
  createTab: () => Promise<TabInfo | null>;
  closeTab: (tabId: string) => Promise<boolean>;
  switchTab: (tabId: string) => Promise<boolean>;
  getTabs: () => Promise<TabInfo[]>;
  onTabsUpdated: (callback: (tabs: TabInfo[]) => void) => void;
  removeTabsUpdatedListener: () => void;

  getWorkspaces: () => Promise<WorkspaceInfo[]>;
  getWorkspaceState: () => Promise<WorkspaceSnapshot>;
  createWorkspace: (name: string) => Promise<WorkspaceInfo | null>;
  removeWorkspace: (workspaceId: string) => Promise<boolean>;
  switchWorkspace: (workspaceId: string) => Promise<boolean>;
  moveTabToWorkspace: (tabId: string, workspaceId: string) => Promise<boolean>;
  openWorkspaceMenu: (point: PopupPoint) => Promise<boolean>;
  showContextDashboard: () => Promise<boolean>;
  openTabContextMenu: (tabId: string, point: PopupPoint) => Promise<boolean>;
  onWorkspaceStateUpdated: (
    callback: (state: WorkspaceSnapshot) => void,
  ) => void;
  removeWorkspaceStateUpdatedListener: () => void;
  onWorkspaceCreateRequested: (callback: () => void) => void;
  removeWorkspaceCreateRequestedListener: () => void;
  onFocusAddressBar: (callback: () => void) => void;
  removeFocusAddressBarListener: () => void;

  navigateTab: (tabId: string, url: string) => Promise<void>;
  goBack: (tabId: string) => Promise<void>;
  goForward: (tabId: string) => Promise<void>;
  reload: (tabId: string) => Promise<void>;

  tabScreenshot: (tabId: string) => Promise<string | null>;
  tabRunJs: (tabId: string, code: string) => Promise<unknown>;

  submitAddressBar: (tabId: string, input: string) => Promise<boolean>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    topBarAPI: TopBarAPI;
  }
}

export type { TabInfo, WorkspaceInfo, WorkspaceSnapshot };
