import React, { useEffect, useState, useCallback, useRef } from "react";
import { AGENT_CHAT_MESSAGES_QUERY } from "../../../../events/queries";
import { displayMessagesFromEventRows } from "../chatHistory";
import type { AgentChatEventRow, ChatDisplayMessage } from "../../../types";
import {
  ChatContext,
  type ChatContextType,
  type Message,
} from "./chat-context";

function isChatTurnActive(messages: ChatDisplayMessage[]): boolean {
  return (
    messages.some(
      (message) =>
        (message.role === "assistant" && message.isStreaming) ||
        (message.role === "tool" && message.status === "running"),
    ) || messages[messages.length - 1]?.role === "user"
  );
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const historyLoadGeneration = useRef(0);

  const loadMessagesFromEventLog = useCallback(async (): Promise<void> => {
    const loadId = ++historyLoadGeneration.current;

    try {
      const chatContext = await window.agentChatAPI.getChatContext();
      if (!chatContext || loadId !== historyLoadGeneration.current) {
        return;
      }

      const rows = await window.agentChatAPI.queryDatabase(
        AGENT_CHAT_MESSAGES_QUERY,
        [chatContext.topic],
      );

      if (loadId !== historyLoadGeneration.current) {
        return;
      }

      const storedMessages = displayMessagesFromEventRows(
        rows as AgentChatEventRow[],
        chatContext.tabId,
      );

      setMessages(storedMessages);
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  }, []);

  useEffect(() => {
    void loadMessagesFromEventLog();
  }, [loadMessagesFromEventLog]);

  const sendMessage = useCallback(async (content: string): Promise<void> => {
    historyLoadGeneration.current += 1;
    setIsLoading(true);

    try {
      const messageId = Date.now().toString();

      await window.agentChatAPI.sendChatMessage({
        message: content,
        messageId: messageId,
      });
    } catch (error) {
      console.error("Failed to send message:", error);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleMessagesUpdated = (updatedMessages: unknown[]): void => {
      historyLoadGeneration.current += 1;
      const nextMessages = updatedMessages as ChatDisplayMessage[];
      setMessages(nextMessages);
      setIsLoading(isChatTurnActive(nextMessages));
    };

    window.agentChatAPI.onMessagesUpdated(handleMessagesUpdated);

    return () => {
      window.agentChatAPI.removeMessagesUpdatedListener();
    };
  }, []);

  const value: ChatContextType = {
    messages,
    isLoading,
    sendMessage,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
