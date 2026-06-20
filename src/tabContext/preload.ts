import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

interface WorkspaceContext {
  topic: string;
  name: string;
}

const contextDashboardAPI = {
  getActiveWorkspaceContext: (): Promise<WorkspaceContext> =>
    electronAPI.ipcRenderer.invoke("get-active-workspace-context"),
  queryDatabase: (sql: string, params?: unknown[]) =>
    electronAPI.ipcRenderer.invoke("db-query", sql, params),
  onEvent: (callback: (event: unknown) => void) => {
    electronAPI.ipcRenderer.on("event-logged", (_, event) => callback(event));
  },
  removeEventListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("event-logged");
  },
  onWorkspaceContextUpdated: (
    callback: (context: WorkspaceContext) => void,
  ) => {
    electronAPI.ipcRenderer.on("workspace-context-updated", (_, context) =>
      callback(context),
    );
  },
  removeWorkspaceContextUpdatedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("workspace-context-updated");
  },
  switchTab: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("switch-tab", tabId),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("contextDashboardAPI", contextDashboardAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.contextDashboardAPI = contextDashboardAPI;
}
