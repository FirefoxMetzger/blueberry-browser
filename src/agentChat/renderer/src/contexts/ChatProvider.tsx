import React, { useEffect, useState, useCallback, useRef } from "react";
import { AGENT_CHAT_MESSAGES_QUERY } from "../../../../events/queries";
import {
  displayMessagesFromEventRows,
  type AgentChatEventRow,
} from "../../../chatHistory";
import { sanitizeAssistantText } from "../../../displayMessages";
import {
  ChatContext,
  type ChatContextType,
  type Message,
} from "./chat-context";

const isDisplayMessage = (value: unknown): value is Message => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    typeof message.role === "string" &&
    (message.role === "user" ||
      message.role === "assistant" ||
      message.role === "tool")
  );
};

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

  const clearChat = useCallback(async (): Promise<void> => {
    try {
      await window.agentChatAPI.clearChat();
      setMessages([]);
    } catch (error) {
      console.error("Failed to clear chat:", error);
    }
  }, []);

  const getPageText = useCallback(async (): Promise<string | null> => {
    try {
      return await window.agentChatAPI.getPageText();
    } catch (error) {
      console.error("Failed to get page text:", error);
      return null;
    }
  }, []);

  const getCurrentUrl = useCallback(async (): Promise<string | null> => {
    try {
      return await window.agentChatAPI.getCurrentUrl();
    } catch (error) {
      console.error("Failed to get current URL:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    const handleChatResponse = (data: {
      messageId: string;
      content: string;
      isComplete: boolean;
    }): void => {
      if (data.isComplete) {
        setIsLoading(false);
      }
    };

    const handleMessagesUpdated = (updatedMessages: unknown[]): void => {
      historyLoadGeneration.current += 1;
      const convertedMessages = updatedMessages
        .filter(isDisplayMessage)
        .map((message) => {
          if (message.role === "assistant") {
            return {
              ...message,
              content: sanitizeAssistantText(message.content),
            };
          }
          return message;
        });
      setMessages(convertedMessages);
    };

    window.agentChatAPI.onChatResponse(handleChatResponse);
    window.agentChatAPI.onMessagesUpdated(handleMessagesUpdated);

    return () => {
      window.agentChatAPI.removeChatResponseListener();
      window.agentChatAPI.removeMessagesUpdatedListener();
    };
  }, []);

  const value: ChatContextType = {
    messages,
    isLoading,
    sendMessage,
    clearChat,
    getPageText,
    getCurrentUrl,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
