import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

const eventPanelAPI = {
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
    contextBridge.exposeInMainWorld("eventPanelAPI", eventPanelAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.eventPanelAPI = eventPanelAPI;
}
