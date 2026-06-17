import { ElectronAPI } from "@electron-toolkit/preload";

interface ChatRequest {
  message: string;
  messageId: string;
}

interface ChatResponse {
  messageId: string;
  content: string;
  isComplete: boolean;
}

interface TabInfo {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
}

interface WorkspaceContext {
  topic: string;
  name: string;
}

interface AgentChatContext {
  tabId: string;
  topic: string;
}

interface AgentChatAPI {
  sendChatMessage: (request: ChatRequest) => Promise<void>;
  clearChat: () => Promise<boolean>;
  getTabId: () => Promise<string | null>;
  getChatContext: () => Promise<AgentChatContext | null>;
  getActiveWorkspaceContext: () => Promise<WorkspaceContext>;
  queryDatabase: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  getMessages: () => Promise<unknown[]>;
  onChatResponse: (callback: (data: ChatResponse) => void) => void;
  onMessagesUpdated: (callback: (messages: unknown[]) => void) => void;
  removeChatResponseListener: () => void;
  removeMessagesUpdatedListener: () => void;
  getPageText: () => Promise<string | null>;
  getCurrentUrl: () => Promise<string | null>;
  getActiveTabInfo: () => Promise<TabInfo | null>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    agentChatAPI: AgentChatAPI;
  }
}
