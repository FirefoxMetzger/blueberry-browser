import { createContext } from "react";
import type { ChatDisplayMessage } from "../../../types";

export type Message = ChatDisplayMessage;

export interface ChatContextType {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (content: string) => Promise<void>;
}

export const ChatContext = createContext<ChatContextType | null>(null);
