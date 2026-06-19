import { useContext } from "react";
import { ChatContext, type ChatContextType } from "./chat-context";

export function useChat(): ChatContextType {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
