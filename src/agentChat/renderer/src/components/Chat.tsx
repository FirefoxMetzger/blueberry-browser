import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
  ArrowUp,
  ArrowLeft,
  BookOpen,
  Camera,
  ChevronDown,
  LayoutList,
  Loader2,
  MessageSquare,
  MousePointerClick,
  Plus,
  ScrollText,
  Search,
  Type,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useChat } from "../contexts/useChat";
import type { Message } from "../contexts/chat-context";
import type { GrepMatchCard, ListTabCard } from "../../../displayMessages";
import { Favicon } from "./Favicon";
import { cn } from "../lib/utils";

// Auto-scroll hook
const useAutoScroll = (
  messages: Message[],
): React.RefObject<HTMLDivElement | null> => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  useLayoutEffect(() => {
    if (messages.length > prevCount.current) {
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      }, 100);
    }
    prevCount.current = messages.length;
  }, [messages.length]);

  return scrollRef;
};

// User Message Component - appears on the right
const UserMessage: React.FC<{ content: string }> = ({ content }) => (
  <div className="relative max-w-[85%] ml-auto animate-fade-in">
    <div className="bg-muted dark:bg-muted/50 rounded-3xl px-6 py-4">
      <div className="text-foreground" style={{ whiteSpace: "pre-wrap" }}>
        {content}
      </div>
    </div>
  </div>
);

// Streaming Text Component
const StreamingText: React.FC<{ content: string }> = ({ content }) => {
  const [displayedContent, setDisplayedContent] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < content.length) {
      const timer = setTimeout(() => {
        setDisplayedContent(content.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, 10);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [content, currentIndex]);

  return (
    <div className="whitespace-pre-wrap text-foreground">
      {displayedContent}
      {currentIndex < content.length && (
        <span className="inline-block w-2 h-5 bg-primary/60 dark:bg-primary/40 ml-0.5 animate-pulse" />
      )}
    </div>
  );
};

// Markdown Renderer Component
const Markdown: React.FC<{ content: string }> = ({ content }) => (
  <div
    className="prose prose-sm dark:prose-invert max-w-none 
                    prose-headings:text-foreground prose-p:text-foreground 
                    prose-strong:text-foreground prose-ul:text-foreground 
                    prose-ol:text-foreground prose-li:text-foreground
                    prose-a:text-primary hover:prose-a:underline
                    prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 
                    prose-code:rounded prose-code:text-sm prose-code:text-foreground
                    prose-pre:bg-muted dark:prose-pre:bg-muted/50 prose-pre:p-3 
                    prose-pre:rounded-lg prose-pre:overflow-x-auto"
  >
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        code: ({ className, children, ...props }) => {
          const inline = !className;
          return inline ? (
            <code
              className="bg-muted dark:bg-muted/50 px-1 py-0.5 rounded text-sm text-foreground"
              {...props}
            >
              {children}
            </code>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        a: ({ children, href }) => (
          <a
            href={href}
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

// Assistant Message Component - appears on the left
const AssistantMessage: React.FC<{
  content: string;
  isStreaming?: boolean;
  isError?: boolean;
}> = ({ content, isStreaming, isError }) => {
  if (!content.trim()) {
    return null;
  }

  return (
    <div className="relative w-full animate-fade-in">
      <div
        className={cn(
          "py-1",
          isError &&
            "rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive",
        )}
      >
        {isStreaming ? (
          <StreamingText content={content} />
        ) : isError ? (
          <div className="whitespace-pre-wrap">{content}</div>
        ) : (
          <Markdown content={content} />
        )}
      </div>
    </div>
  );
};

const toolIcon = (toolName: string): LucideIcon => {
  switch (toolName) {
    case "list_tabs":
      return LayoutList;
    case "grep":
    case "search_workspace":
      return Search;
    case "screenshot":
      return Camera;
    case "read_tab":
      return BookOpen;
    case "open_tab":
      return Plus;
    case "scroll_tab":
      return ScrollText;
    case "click_tab":
      return MousePointerClick;
    case "go_back_tab":
      return ArrowLeft;
    case "type_tab":
      return Type;
    default:
      return Wrench;
  }
};

const getTabFavicon = (url: string): string | null => {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return null;
  }
};

const ListTabCardButton: React.FC<{ tab: ListTabCard }> = ({ tab }) => (
  <button
    type="button"
    onClick={(event) => {
      event.stopPropagation();
      void window.agentChatAPI.switchTab(tab.id);
    }}
    className={cn(
      "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
      "hover:bg-muted/60 dark:hover:bg-muted/40",
      tab.isActive
        ? "border-primary/30 bg-background"
        : "border-border/60 bg-background/80",
    )}
  >
    <div className="flex min-w-0 items-center gap-2">
      {tab.kind === "agent-chat" ? (
        <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <Favicon src={getTabFavicon(tab.url)} />
      )}
      <span className="truncate text-sm font-medium text-foreground">
        {tab.title || "Untitled"}
      </span>
    </div>
    <div className="mt-1 truncate pl-6 text-xs text-muted-foreground">
      {tab.kind === "agent-chat"
        ? "Agent chat"
        : !tab.url || tab.url === "no URL"
          ? "no URL"
          : tab.url}
    </div>
  </button>
);

const GrepMatchCardButton: React.FC<{ match: GrepMatchCard }> = ({ match }) => (
  <button
    type="button"
    onClick={(event) => {
      event.stopPropagation();
      void window.agentChatAPI.navigateGrepMatch({
        tabId: match.tabId,
        sourceType: match.sourceType,
        pattern: match.pattern,
        caseInsensitive: match.caseInsensitive,
        lineText: match.lineText,
        lineNumber: match.lineNumber,
      });
    }}
    className={cn(
      "w-full rounded-xl border border-border/60 bg-background/80 px-3 py-2.5 text-left transition-colors",
      "hover:bg-muted/60 dark:hover:bg-muted/40",
    )}
  >
    <div className="flex min-w-0 items-center gap-2">
      {match.sourceType === "agent-chat" ? (
        <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <Favicon src={match.url ? getTabFavicon(match.url) : null} />
      )}
      <span className="truncate text-sm font-medium text-foreground">
        {match.title || "Untitled"}
      </span>
      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        L{match.lineNumber}
      </span>
    </div>
    <div className="mt-1 truncate pl-6 text-xs text-muted-foreground">
      {match.sourceType === "agent-chat"
        ? `Agent chat · line ${match.lineNumber}`
        : !match.url || match.url === "no URL"
          ? `line ${match.lineNumber}`
          : `${match.url} · line ${match.lineNumber}`}
    </div>
    {match.lineText.trim() && (
      <div className="mt-1.5 truncate pl-6 font-mono text-xs text-foreground/80">
        {(() => {
          const trimmed = match.lineText.trim();
          return trimmed.length <= 120 ? trimmed : `${trimmed.slice(0, 120)}…`;
        })()}
      </div>
    )}
  </button>
);

const GrepMatchCards: React.FC<{ matches: GrepMatchCard[] }> = ({
  matches,
}) => (
  <div className="max-h-96 space-y-2 overflow-y-auto">
    {matches.map((match) => (
      <GrepMatchCardButton key={match.id} match={match} />
    ))}
  </div>
);

const ListTabsCards: React.FC<{ tabs: ListTabCard[] }> = ({ tabs }) => (
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
    {tabs.map((tab) => (
      <ListTabCardButton key={tab.id} tab={tab} />
    ))}
  </div>
);

const CollapsibleToolBody: React.FC<{
  isExpanded: boolean;
  children: React.ReactNode;
}> = ({ isExpanded, children }) => (
  <div
    className={cn(
      "grid transition-[grid-template-rows] duration-200 ease-out",
      isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
    )}
  >
    <div className="min-h-0 overflow-hidden">
      <div
        className={cn(
          "border-t border-border/70 px-3 pb-3 pt-2 transition-opacity duration-200 ease-out",
          isExpanded ? "opacity-100" : "opacity-0",
        )}
      >
        {children}
      </div>
    </div>
  </div>
);

const ToolMessage: React.FC<{
  message: Extract<Message, { role: "tool" }>;
}> = ({ message }) => {
  const Icon = toolIcon(message.toolName);
  const isRunning = message.status === "running";
  const isError = message.status === "error";
  const showScreenshotPreview =
    message.toolName === "screenshot" &&
    message.status === "complete" &&
    Boolean(message.previewImageUrl);
  const showListTabsCards =
    message.toolName === "list_tabs" &&
    message.status === "complete" &&
    Boolean(message.tabCards?.length);
  const showGrepMatchCards =
    (message.toolName === "grep" || message.toolName === "search_workspace") &&
    message.status === "complete" &&
    Boolean(message.grepMatches?.length);
  const isNavigableReadTab =
    message.toolName === "read_tab" &&
    message.status === "complete" &&
    Boolean(message.readTabCard);
  const hasCollapsibleBody =
    showListTabsCards || showScreenshotPreview || showGrepMatchCards;
  const [isExpanded, setIsExpanded] = useState(true);

  const handleToolHeaderClick = (): void => {
    if (isNavigableReadTab && message.readTabCard) {
      void window.agentChatAPI.switchTab(message.readTabCard.tabId);
      return;
    }

    if (hasCollapsibleBody) {
      setIsExpanded((open) => !open);
    }
  };

  const isToolHeaderInteractive = isNavigableReadTab || hasCollapsibleBody;

  return (
    <div className="animate-fade-in">
      <div
        className={cn(
          "rounded-2xl border text-sm",
          isError
            ? "border-destructive/30 bg-destructive/5"
            : "border-border/70 bg-muted/30 dark:bg-muted/20",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-foreground",
            isToolHeaderInteractive &&
              "cursor-pointer hover:bg-muted/20 dark:hover:bg-muted/30",
          )}
          onClick={isToolHeaderInteractive ? handleToolHeaderClick : undefined}
          onKeyDown={
            isToolHeaderInteractive
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleToolHeaderClick();
                  }
                }
              : undefined
          }
          role={isToolHeaderInteractive ? "button" : undefined}
          aria-expanded={hasCollapsibleBody ? isExpanded : undefined}
          tabIndex={isToolHeaderInteractive ? 0 : undefined}
        >
          {isRunning ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
          ) : (
            <Icon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="font-medium">{message.toolName}</span>
          <span className="text-muted-foreground">·</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {isError ? message.error : message.summary}
          </span>
          {hasCollapsibleBody && (
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
                !isExpanded && "-rotate-90",
              )}
            />
          )}
        </div>
        {hasCollapsibleBody && (
          <CollapsibleToolBody isExpanded={isExpanded}>
            {showListTabsCards && message.tabCards && (
              <ListTabsCards tabs={message.tabCards} />
            )}
            {showGrepMatchCards && message.grepMatches && (
              <GrepMatchCards matches={message.grepMatches} />
            )}
            {showScreenshotPreview && (
              <img
                src={message.previewImageUrl}
                alt={message.summary ?? "Screenshot"}
                className="max-h-80 w-full rounded-lg border border-border/50 bg-background object-contain"
              />
            )}
          </CollapsibleToolBody>
        )}
      </div>
    </div>
  );
};

// Loading Indicator with spinning star
const LoadingIndicator: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div
      className={cn(
        "transition-transform duration-300 ease-in-out",
        isVisible ? "scale-100" : "scale-0",
      )}
    >
      ...
    </div>
  );
};

// Chat Input Component with pill design
const ChatInput: React.FC<{
  onSend: (message: string) => void;
  disabled: boolean;
}> = ({ onSend, disabled }) => {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      const newHeight = Math.min(scrollHeight, 200);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [value]);

  const handleSubmit = (): void => {
    if (value.trim() && !disabled) {
      onSend(value.trim());
      setValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "24px";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className={cn(
        "w-full border p-3 rounded-3xl bg-background dark:bg-secondary",
        "shadow-chat animate-spring-scale outline-none transition-all duration-200",
        isFocused
          ? "border-primary/20 dark:border-primary/30"
          : "border-border",
      )}
    >
      <div className="w-full px-3 py-2">
        <div className="w-full flex items-start gap-3">
          <div className="relative flex-1 overflow-hidden">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              className="w-full resize-none outline-none bg-transparent 
                                     text-foreground placeholder:text-muted-foreground
                                     min-h-[24px] max-h-[200px]"
              rows={1}
              style={{ lineHeight: "24px" }}
            />
          </div>
        </div>
      </div>

      <div className="w-full flex items-center gap-1.5 px-1 mt-2 mb-1">
        <div className="flex-1" />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className={cn(
            "size-9 rounded-full flex items-center justify-center",
            "transition-all duration-200",
            "bg-primary text-primary-foreground",
            "hover:opacity-80 disabled:opacity-50",
          )}
        >
          <ArrowUp className="size-5" />
        </button>
      </div>
    </div>
  );
};

interface ConversationTurn {
  user?: Extract<Message, { role: "user" }>;
  items: Message[];
}

const ConversationTurnComponent: React.FC<{
  turn: ConversationTurn;
  isLoading?: boolean;
}> = ({ turn, isLoading }) => (
  <div className="pt-12 flex flex-col gap-4">
    {turn.user && <UserMessage content={turn.user.content} />}
    {turn.items.map((item) => {
      if (item.role === "tool") {
        return <ToolMessage key={item.id} message={item} />;
      }
      if (item.role === "assistant") {
        return (
          <AssistantMessage
            key={item.id}
            content={item.content}
            isStreaming={item.isStreaming}
            isError={item.role === "assistant" ? item.isError : undefined}
          />
        );
      }
      return null;
    })}
    {isLoading && (
      <div className="flex justify-start">
        <LoadingIndicator />
      </div>
    )}
  </div>
);

function groupConversationTurns(messages: Message[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let currentTurn: ConversationTurn | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      currentTurn = { user: message, items: [] };
      turns.push(currentTurn);
      continue;
    }

    if (!currentTurn) {
      currentTurn = { items: [] };
      turns.push(currentTurn);
    }

    currentTurn.items.push(message);
  }

  return turns;
}

// Main Chat Component
export const Chat: React.FC = () => {
  const { messages, isLoading, sendMessage } = useChat();
  const scrollRef = useAutoScroll(messages);
  const conversationTurns = groupConversationTurns(messages);

  const showLoadingAfterLastTurn =
    isLoading && messages[messages.length - 1]?.role === "user";

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="pb-4 relative max-w-3xl mx-auto px-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <div className="text-center animate-fade-in max-w-md mx-auto gap-2 flex flex-col">
                <h3 className="text-2xl font-bold">🫐</h3>
                <p className="text-muted-foreground text-sm">
                  Ask anything to get started
                </p>
              </div>
            </div>
          ) : (
            conversationTurns.map((turn, index) => (
              <ConversationTurnComponent
                key={`turn-${index}`}
                turn={turn}
                isLoading={
                  showLoadingAfterLastTurn &&
                  index === conversationTurns.length - 1
                }
              />
            ))
          )}

          <div ref={scrollRef} />
        </div>
      </div>

      <div className="p-4">
        <ChatInput onSend={sendMessage} disabled={isLoading} />
      </div>
    </div>
  );
};
