import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { AGENT_CHAT_MESSAGES_QUERY } from '../../../../events/queries'
import {
    chatMessagesFromEventRows,
    type AgentChatEventRow,
    type StoredChatMessage,
} from '../../../chatHistory'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    isStreaming?: boolean
}

interface ChatContextType {
    messages: Message[]
    isLoading: boolean

    // Chat actions
    sendMessage: (content: string) => Promise<void>
    clearChat: () => void

    // Page content access
    getPageText: () => Promise<string | null>
    getCurrentUrl: () => Promise<string | null>
}

const ChatContext = createContext<ChatContextType | null>(null)

const toDisplayMessage = (message: StoredChatMessage): Message => ({
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    isStreaming: false,
})

export const useChat = () => {
    const context = useContext(ChatContext)
    if (!context) {
        throw new Error('useChat must be used within a ChatProvider')
    }
    return context
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(false)

    const loadMessagesFromEventLog = useCallback(async (): Promise<void> => {
        try {
            const chatContext = await window.agentChatAPI.getChatContext()
            if (!chatContext) {
                return
            }

            const rows = await window.agentChatAPI.queryDatabase(
                AGENT_CHAT_MESSAGES_QUERY,
                [chatContext.topic]
            )

            const storedMessages = chatMessagesFromEventRows(
                rows as AgentChatEventRow[],
                chatContext.tabId
            )

            setMessages(storedMessages.map(toDisplayMessage))
        } catch (error) {
            console.error('Failed to load messages:', error)
        }
    }, [])

    // Load conversation history from the event log
    useEffect(() => {
        void loadMessagesFromEventLog()
    }, [loadMessagesFromEventLog])

    const sendMessage = useCallback(async (content: string) => {
        setIsLoading(true)

        try {
            const messageId = Date.now().toString()

            // Send message to main process (which will handle context)
            await window.agentChatAPI.sendChatMessage({
                message: content,
                messageId: messageId
            })

            // Messages will be updated via the chat-messages-updated event
        } catch (error) {
            console.error('Failed to send message:', error)
        } finally {
            setIsLoading(false)
        }
    }, [])

    const clearChat = useCallback(async () => {
        try {
            await window.agentChatAPI.clearChat()
            setMessages([])
        } catch (error) {
            console.error('Failed to clear chat:', error)
        }
    }, [])

    const getPageText = useCallback(async () => {
        try {
            return await window.agentChatAPI.getPageText()
        } catch (error) {
            console.error('Failed to get page text:', error)
            return null
        }
    }, [])

    const getCurrentUrl = useCallback(async () => {
        try {
            return await window.agentChatAPI.getCurrentUrl()
        } catch (error) {
            console.error('Failed to get current URL:', error)
            return null
        }
    }, [])

    // Set up message listeners
    useEffect(() => {
        // Listen for streaming response updates
        const handleChatResponse = (data: { messageId: string; content: string; isComplete: boolean }) => {
            if (data.isComplete) {
                setIsLoading(false)
            }
        }

        // Listen for message updates from main process
        const handleMessagesUpdated = (updatedMessages: any[]) => {
            const convertedMessages = updatedMessages.map((msg: any, index: number) => ({
                id: `msg-${index}`,
                role: msg.role,
                content: typeof msg.content === 'string' 
                    ? msg.content 
                    : msg.content.find((p: any) => p.type === 'text')?.text || '',
                timestamp: Date.now(),
                isStreaming: false
            }))
            setMessages(convertedMessages)
        }

        window.agentChatAPI.onChatResponse(handleChatResponse)
        window.agentChatAPI.onMessagesUpdated(handleMessagesUpdated)

        return () => {
            window.agentChatAPI.removeChatResponseListener()
            window.agentChatAPI.removeMessagesUpdatedListener()
        }
    }, [])

    const value: ChatContextType = {
        messages,
        isLoading,
        sendMessage,
        clearChat,
        getPageText,
        getCurrentUrl
    }

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    )
}
