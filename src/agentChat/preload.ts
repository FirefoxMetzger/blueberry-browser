import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

interface ChatRequest {
  message: string;
  messageId: string;
}

interface ChatResponse {
  messageId: string;
  content: string;
  isComplete: boolean;
}

interface WorkspaceContext {
  topic: string;
  name: string;
}

const agentChatAPI = {
  sendChatMessage: (request: ChatRequest) =>
    electronAPI.ipcRenderer.invoke("agent-chat-message", request),

  clearChat: () => electronAPI.ipcRenderer.invoke("agent-chat-clear-chat"),

  getTabId: () => electronAPI.ipcRenderer.invoke("agent-chat-get-tab-id"),

  getChatContext: (): Promise<{ tabId: string; topic: string } | null> =>
    electronAPI.ipcRenderer.invoke("agent-chat-get-context"),

  getActiveWorkspaceContext: (): Promise<WorkspaceContext> =>
    electronAPI.ipcRenderer.invoke("get-active-workspace-context"),

  queryDatabase: (sql: string, params?: unknown[]) =>
    electronAPI.ipcRenderer.invoke("db-query", sql, params),

  getMessages: () => electronAPI.ipcRenderer.invoke("agent-chat-get-messages"),

  onChatResponse: (callback: (data: ChatResponse) => void) => {
    electronAPI.ipcRenderer.on("chat-response", (_, data) => callback(data));
  },

  onMessagesUpdated: (callback: (messages: unknown[]) => void) => {
    electronAPI.ipcRenderer.on("chat-messages-updated", (_, messages) =>
      callback(messages),
    );
  },

  removeChatResponseListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("chat-response");
  },

  removeMessagesUpdatedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("chat-messages-updated");
  },

  getPageText: () => electronAPI.ipcRenderer.invoke("get-page-text"),
  getCurrentUrl: () => electronAPI.ipcRenderer.invoke("get-current-url"),
  getActiveTabInfo: () => electronAPI.ipcRenderer.invoke("get-active-tab-info"),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("agentChatAPI", agentChatAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.agentChatAPI = agentChatAPI;
}
