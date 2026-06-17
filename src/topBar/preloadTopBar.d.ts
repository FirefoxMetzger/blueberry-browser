import { ElectronAPI } from "@electron-toolkit/preload";

interface TabInfo {
  id: string;
  title: string;
  url: string;
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
}

interface PopupPoint {
  x: number;
  y: number;
}

interface TopBarAPI {
  createTab: (url?: string) => Promise<TabInfo | null>;
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
  openTabContextMenu: (tabId: string, point: PopupPoint) => Promise<boolean>;
  onWorkspaceStateUpdated: (
    callback: (state: WorkspaceSnapshot) => void,
  ) => void;
  removeWorkspaceStateUpdatedListener: () => void;
  onWorkspaceCreateRequested: (callback: () => void) => void;
  removeWorkspaceCreateRequestedListener: () => void;

  navigateTab: (tabId: string, url: string) => Promise<void>;
  goBack: (tabId: string) => Promise<void>;
  goForward: (tabId: string) => Promise<void>;
  reload: (tabId: string) => Promise<void>;

  tabScreenshot: (tabId: string) => Promise<string | null>;
  tabRunJs: (tabId: string, code: string) => Promise<unknown>;

  toggleSidebar: () => Promise<void>;

  queryDatabase: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  onEvent: (callback: (event: unknown) => void) => void;
  removeEventListener: () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    topBarAPI: TopBarAPI;
  }
}

export type { TabInfo, WorkspaceInfo, WorkspaceSnapshot };
