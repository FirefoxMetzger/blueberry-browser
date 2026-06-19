import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

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

const topBarAPI = {
  createTab: () => electronAPI.ipcRenderer.invoke("create-tab"),
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
  showContextDashboard: () =>
    electronAPI.ipcRenderer.invoke("show-context-dashboard"),
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
  onFocusAddressBar: (callback: () => void) => {
    electronAPI.ipcRenderer.on("focus-address-bar", () => callback());
  },
  removeFocusAddressBarListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("focus-address-bar");
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

  submitAddressBar: (tabId: string, input: string) =>
    electronAPI.ipcRenderer.invoke("submit-address-bar", tabId, input),
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
