import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { useBrowser } from "../contexts/BrowserContext";
import { ToolBarButton } from "../components/ToolBarButton";
import { Favicon } from "../components/Favicon";
import { DarkModeToggle } from "../components/DarkModeToggle";
import { cn } from "../lib/utils";

const focusInputWithRetry = (
  getInput: () => HTMLInputElement | null,
  attempt = 0,
): void => {
  const input = getInput();
  if (input) {
    input.focus();
    input.select();
    return;
  }

  if (attempt < 12) {
    window.setTimeout(() => {
      focusInputWithRetry(getInput, attempt + 1);
    }, 16);
  }
};

export const AddressBar: React.FC = () => {
  const {
    activeTab,
    navigateToUrl,
    submitAddressBar,
    goBack,
    goForward,
    reload,
    isLoading,
  } = useBrowser();
  const [url, setUrl] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openAddressBarForInput = useCallback((): void => {
    setIsEditing(true);
    setIsFocused(true);
    setUrl("");
    window.requestAnimationFrame(() => {
      focusInputWithRetry(() => inputRef.current);
    });
  }, []);

  useEffect(() => {
    if (activeTab?.kind === "pending") {
      openAddressBarForInput();
    } else if (activeTab && !isEditing) {
      if (activeTab.kind === "agent-chat") {
        setUrl(activeTab.title || "Agent Chat");
      } else {
        setUrl(activeTab.url || "");
      }
    }
  }, [activeTab, isEditing, openAddressBarForInput]);

  useEffect(() => {
    window.topBarAPI.onFocusAddressBar(openAddressBarForInput);
    return () => {
      window.topBarAPI.removeFocusAddressBarListener();
    };
  }, [openAddressBarForInput]);

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!url.trim() || !activeTab) return;

    if (activeTab.kind === "pending") {
      void submitAddressBar(activeTab.id, url.trim());
    } else if (activeTab.kind === "browser") {
      void navigateToUrl(url.trim());
    }

    setIsEditing(false);
    setIsFocused(false);
    (document.activeElement as HTMLElement)?.blur();
  };

  const handleFocus = (): void => {
    if (!activeTab || activeTab.kind === "agent-chat") return;
    setIsEditing(true);
    setIsFocused(true);
    if (activeTab.kind === "pending") {
      setUrl("");
    }
  };

  const handleBlur = (): void => {
    setIsEditing(false);
    setIsFocused(false);
    if (activeTab) {
      if (activeTab.kind === "pending") {
        setUrl("");
      } else if (activeTab.kind === "agent-chat") {
        setUrl(activeTab.title || "Agent Chat");
      } else {
        setUrl(activeTab.url || "");
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Escape") {
      setIsEditing(false);
      setIsFocused(false);
      handleBlur();
      (e.target as HTMLInputElement).blur();
    }
  };

  const isBrowserTab = activeTab?.kind === "browser";
  const isPendingTab = activeTab?.kind === "pending";
  const isAgentChat = activeTab?.kind === "agent-chat";
  const canNavigate = isBrowserTab && activeTab !== null;

  const getDomain = (): string => {
    if (isAgentChat) return activeTab?.title || "Agent Chat";
    if (isPendingTab) return "New Tab";
    if (!activeTab?.url) return "";
    try {
      const urlObj = new URL(activeTab.url);
      return urlObj.hostname.replace("www.", "");
    } catch {
      return activeTab.url;
    }
  };

  const getPath = (): string => {
    if (!isBrowserTab || !activeTab?.url) return "";
    try {
      const urlObj = new URL(activeTab.url);
      return urlObj.pathname + urlObj.search + urlObj.hash;
    } catch {
      return "";
    }
  };

  const getFavicon = (): string | null => {
    if (isAgentChat || isPendingTab || !activeTab?.url) return null;
    try {
      const domain = new URL(activeTab.url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      return null;
    }
  };

  const placeholder = isPendingTab
    ? "Enter a URL or message"
    : isAgentChat
      ? "Agent chat"
      : activeTab
        ? "Enter URL or search term"
        : "No active tab";

  return (
    <>
      <div className="flex gap-1.5 app-region-no-drag">
        <ToolBarButton
          Icon={ArrowLeft}
          onClick={goBack}
          active={canNavigate && !isLoading}
        />
        <ToolBarButton
          Icon={ArrowRight}
          onClick={goForward}
          active={canNavigate && !isLoading}
        />
        <ToolBarButton
          onClick={reload}
          active={canNavigate && !isLoading}
        >
          {isLoading ? (
            <Loader2 className="size-4.5 animate-spin" />
          ) : (
            <RefreshCw className="size-4.5" />
          )}
        </ToolBarButton>
      </div>

      {isFocused ? (
        <form
          onSubmit={handleSubmit}
          className="flex-1 min-w-0 max-w-full app-region-no-drag"
        >
          <div className="bg-background rounded-lg shadow-md p-1 dark:bg-secondary">
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="w-full px-1 py-0.5 text-xs outline-none bg-transparent text-foreground truncate"
              placeholder={placeholder}
              disabled={!activeTab || isAgentChat}
              spellCheck={false}
            />
          </div>
        </form>
      ) : (
        <div
          onClick={handleFocus}
          className={cn(
            "flex-1 px-3 h-8 rounded-md group/address-bar",
            "hover:bg-muted text-muted-foreground app-region-no-drag",
            "transition-colors duration-200",
            "dark:hover:bg-muted/50",
            activeTab && !isAgentChat ? "cursor-text" : "cursor-default",
          )}
        >
          <div className="flex h-full items-center">
            <div className="size-4 mr-2">
              <Favicon src={getFavicon()} />
            </div>

            <div className="text-[0.8rem] leading-normal truncate flex-1">
              {activeTab ? (
                <>
                  <span className="text-foreground dark:text-foreground">
                    {getDomain()}
                  </span>
                  {isBrowserTab && (
                    <>
                      <span className="group-hover/address-bar:hidden text-muted-foreground/60">
                        {activeTab.title && ` / ${activeTab.title}`}
                      </span>
                      <span className="group-hover/address-bar:inline hidden text-muted-foreground/60">
                        {getPath()}
                      </span>
                    </>
                  )}
                  {isPendingTab && (
                    <span className="text-muted-foreground/60">
                      {" "}
                      — enter a URL or message
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">No active tab</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 app-region-no-drag">
        <DarkModeToggle />
      </div>
    </>
  );
};
