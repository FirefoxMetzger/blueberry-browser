import React from 'react'
import { ChatProvider } from './contexts/ChatContext'
import { Chat } from './components/Chat'
import { useDarkMode } from '@darkMode/useDarkMode'

const SidebarContent: React.FC = () => {
    useDarkMode()

    return (
        <div className="h-screen flex flex-col bg-background border-l border-border">
            <Chat />
        </div>
    )
}

export const SidebarApp: React.FC = () => {
    return (
        <ChatProvider>
            <SidebarContent />
        </ChatProvider>
    )
}
