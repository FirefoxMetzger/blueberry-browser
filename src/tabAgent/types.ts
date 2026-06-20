export interface UserDisplayMessage {
  id: string;
  role: "user";
  content: string;
  timestamp: number;
}

export interface AssistantDisplayMessage {
  id: string;
  role: "assistant";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  isError?: boolean;
}

export interface ListTabCard {
  id: string;
  title: string;
  url: string;
  kind: "browser" | "agent-chat" | "pending";
  isActive?: boolean;
}

export interface GrepMatchCard {
  id: string;
  sourceType: "browser-tab" | "agent-chat";
  tabId: string;
  title: string;
  url?: string;
  lineNumber: number;
  lineText: string;
  pattern: string;
  caseInsensitive: boolean;
}

export interface ReadTabCard {
  tabId: string;
  title: string;
  url: string;
}

export interface ToolDisplayMessage {
  id: string;
  role: "tool";
  toolName: string;
  status: "running" | "complete" | "error";
  input: Record<string, unknown>;
  summary?: string;
  error?: string;
  previewImageUrl?: string;
  tabCards?: ListTabCard[];
  grepMatches?: GrepMatchCard[];
  readTabCard?: ReadTabCard;
  timestamp: number;
}

export type ChatDisplayMessage =
  | UserDisplayMessage
  | AssistantDisplayMessage
  | ToolDisplayMessage;

export interface GrepNavigationRequest {
  tabId: string;
  sourceType: "browser-tab" | "agent-chat";
  pattern: string;
  caseInsensitive: boolean;
  lineText: string;
  lineNumber: number;
}

export interface GrepNavigationResponse {
  success: boolean;
  switched: boolean;
  highlighted: boolean;
}

export interface ChatRequest {
  message: string;
  messageId: string;
}

export interface ChatResponse {
  messageId: string;
  content: string;
  isComplete: boolean;
}

export interface WorkspaceContext {
  topic: string;
  name: string;
}

export interface AgentChatContext {
  tabId: string;
  topic: string;
}

export interface AgentChatEventRow {
  id: number;
  payload: string;
  payload_type: string;
  created: string;
}

export type StoredTurnItem =
  | {
      id: string;
      role: "assistant";
      content: string;
      timestamp: number;
      isError?: boolean;
    }
  | {
      id: string;
      role: "tool";
      toolName: string;
      status: "complete" | "error";
      input: Record<string, unknown>;
      summary?: string;
      error?: string;
      previewImageUrl?: string;
      tabCards?: ListTabCard[];
      grepMatches?: GrepMatchCard[];
      readTabCard?: ReadTabCard;
      timestamp: number;
    };

export interface AgentChatMessagePayload {
  tabId: string;
  message: string;
  messageId: string;
  response?: string;
  turnItems?: StoredTurnItem[];
}
