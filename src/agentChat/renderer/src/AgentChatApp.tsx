import React from "react";
import { ChatProvider } from "./contexts/ChatProvider";
import { Chat } from "./components/Chat";
import { useDarkMode } from "@darkMode/useDarkMode";

export const AgentChatApp: React.FC = () => {
  useDarkMode();

  return (
    <ChatProvider>
      <div className="h-screen flex flex-col bg-background">
        <Chat />
      </div>
    </ChatProvider>
  );
};
