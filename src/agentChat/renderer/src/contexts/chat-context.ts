import { createContext } from "react";
import type { ChatDisplayMessage } from "../../../displayMessages";

export type Message = ChatDisplayMessage & {
  isStreaming?: boolean;
  isError?: boolean;
};

export interface ChatContextType {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
  getPageText: () => Promise<string | null>;
  getCurrentUrl: () => Promise<string | null>;
}

export const ChatContext = createContext<ChatContextType | null>(null);
