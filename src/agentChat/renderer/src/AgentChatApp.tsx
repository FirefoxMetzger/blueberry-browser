import React from "react";
import { ChatProvider } from "./contexts/ChatProvider";
import { Chat } from "./components/Chat";
import { useDarkMode } from "@darkMode/useDarkMode";

const AgentChatContent: React.FC = () => {
  useDarkMode();

  return (
    <div className="h-screen flex flex-col bg-background">
      <Chat />
    </div>
  );
};

export const AgentChatApp: React.FC = () => {
  return (
    <ChatProvider>
      <AgentChatContent />
    </ChatProvider>
  );
};
