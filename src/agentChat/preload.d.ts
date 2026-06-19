import type { ElectronAPI } from "@electron-toolkit/preload";
import type {
  AgentChatContext,
  ChatRequest,
  GrepNavigationRequest,
  GrepNavigationResponse,
} from "./types";

interface AgentChatAPI {
  sendChatMessage: (request: ChatRequest) => Promise<void>;
  clearChat: () => Promise<boolean>;
  getChatContext: () => Promise<AgentChatContext | null>;
  queryDatabase: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  onMessagesUpdated: (callback: (messages: unknown[]) => void) => void;
  removeMessagesUpdatedListener: () => void;
  switchTab: (tabId: string) => Promise<boolean>;
  navigateGrepMatch: (
    request: GrepNavigationRequest,
  ) => Promise<GrepNavigationResponse>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    agentChatAPI: AgentChatAPI;
  }
}
