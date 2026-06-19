import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import type { ChatRequest, GrepNavigationRequest } from "./types";

const agentChatAPI = {
  sendChatMessage: (request: ChatRequest) =>
    electronAPI.ipcRenderer.invoke("agent-chat-message", request),

  clearChat: () => electronAPI.ipcRenderer.invoke("agent-chat-clear-chat"),

  getChatContext: (): Promise<{ tabId: string; topic: string } | null> =>
    electronAPI.ipcRenderer.invoke("agent-chat-get-context"),

  queryDatabase: (sql: string, params?: unknown[]) =>
    electronAPI.ipcRenderer.invoke("db-query", sql, params),

  onMessagesUpdated: (callback: (messages: unknown[]) => void) => {
    electronAPI.ipcRenderer.on("chat-messages-updated", (_, messages) =>
      callback(messages),
    );
  },

  removeMessagesUpdatedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("chat-messages-updated");
  },

  switchTab: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("switch-tab", tabId),
  navigateGrepMatch: (request: GrepNavigationRequest) =>
    electronAPI.ipcRenderer.invoke("navigate-grep-match", request),
};

contextBridge.exposeInMainWorld("electron", electronAPI);
contextBridge.exposeInMainWorld("agentChatAPI", agentChatAPI);
