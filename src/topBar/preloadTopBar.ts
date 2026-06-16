import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

interface TabInfo {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
  workspaceId?: string;
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

const topBarAPI = {
  createTab: (url?: string) =>
    electronAPI.ipcRenderer.invoke("create-tab", url),
  closeTab: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("close-tab", tabId),
  switchTab: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("switch-tab", tabId),
  getTabs: () => electronAPI.ipcRenderer.invoke("get-tabs"),
  onTabsUpdated: (callback: (tabs: TabInfo[]) => void) => {
    electronAPI.ipcRenderer.on("tabs-updated", (_, tabs) => callback(tabs));
  },
  removeTabsUpdatedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("tabs-updated");
  },

  getWorkspaces: () => electronAPI.ipcRenderer.invoke("get-workspaces"),
  getWorkspaceState: () =>
    electronAPI.ipcRenderer.invoke("get-workspace-state"),
  createWorkspace: (name: string) =>
    electronAPI.ipcRenderer.invoke("create-workspace", name),
  removeWorkspace: (workspaceId: string) =>
    electronAPI.ipcRenderer.invoke("remove-workspace", workspaceId),
  switchWorkspace: (workspaceId: string) =>
    electronAPI.ipcRenderer.invoke("switch-workspace", workspaceId),
  moveTabToWorkspace: (tabId: string, workspaceId: string) =>
    electronAPI.ipcRenderer.invoke("move-tab-to-workspace", tabId, workspaceId),
  openWorkspaceMenu: (point: PopupPoint) =>
    electronAPI.ipcRenderer.invoke("open-workspace-menu", point),
  openTabContextMenu: (tabId: string, point: PopupPoint) =>
    electronAPI.ipcRenderer.invoke("open-tab-context-menu", tabId, point),
  onWorkspaceStateUpdated: (callback: (state: WorkspaceSnapshot) => void) => {
    electronAPI.ipcRenderer.on("workspace-state-updated", (_, state) =>
      callback(state),
    );
  },
  removeWorkspaceStateUpdatedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("workspace-state-updated");
  },
  onWorkspaceCreateRequested: (callback: () => void) => {
    electronAPI.ipcRenderer.on("workspace-create-requested", () => callback());
  },
  removeWorkspaceCreateRequestedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("workspace-create-requested");
  },

  navigateTab: (tabId: string, url: string) =>
    electronAPI.ipcRenderer.invoke("navigate-tab", tabId, url),
  goBack: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("tab-go-back", tabId),
  goForward: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("tab-go-forward", tabId),
  reload: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("tab-reload", tabId),

  tabScreenshot: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("tab-screenshot", tabId),
  tabRunJs: (tabId: string, code: string) =>
    electronAPI.ipcRenderer.invoke("tab-run-js", tabId, code),

  toggleSidebar: () => electronAPI.ipcRenderer.invoke("toggle-sidebar"),

  queryDatabase: (sql: string, params?: unknown[]) =>
    electronAPI.ipcRenderer.invoke("db-query", sql, params),
  onEvent: (callback: (event: unknown) => void) => {
    electronAPI.ipcRenderer.on("event-logged", (_, event) => callback(event));
  },
  removeEventListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("event-logged");
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("topBarAPI", topBarAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.topBarAPI = topBarAPI;
}
