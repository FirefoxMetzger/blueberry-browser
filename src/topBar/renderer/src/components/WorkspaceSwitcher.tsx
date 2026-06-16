import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { useBrowser } from "../contexts/BrowserContext";
import { cn } from "@common/lib/utils";

export const WorkspaceSwitcher: React.FC = () => {
  const { workspaces, activeWorkspaceId, createWorkspace } = useBrowser();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces[0];

  const requestCreateWorkspace = useCallback((): void => {
    setIsCreating(true);
  }, []);

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isCreating]);

  const cancelCreateWorkspace = (): void => {
    setWorkspaceName("");
    setIsCreating(false);
  };

  const submitCreateWorkspace = (): void => {
    const name = workspaceName.trim();
    if (!name) {
      return;
    }

    void createWorkspace(name);
    setWorkspaceName("");
    setIsCreating(false);
  };

  useEffect(() => {
    window.topBarAPI.onWorkspaceCreateRequested(requestCreateWorkspace);
    return () => window.topBarAPI.removeWorkspaceCreateRequestedListener();
  }, [requestCreateWorkspace]);

  const openMenu = (): void => {
    const rect = buttonRef.current?.getBoundingClientRect();
    void window.topBarAPI.openWorkspaceMenu({
      x: Math.round(rect?.left ?? 0),
      y: Math.round(rect?.bottom ?? 0),
    });
  };

  return (
    <div className="relative app-region-no-drag shrink-0 flex items-center gap-1">
      {isCreating ? (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                submitCreateWorkspace();
              }
              if (event.key === "Escape") {
                cancelCreateWorkspace();
              }
            }}
            placeholder="Workspace name"
            className={cn(
              "h-8 w-36 rounded-md border border-input bg-background px-2 text-xs",
              "focus:outline-none focus:ring-1 focus:ring-ring",
            )}
          />
          <button
            type="button"
            title="Create Workspace"
            className={cn(
              "flex items-center justify-center h-8 w-8 rounded-md",
              "text-primary hover:bg-muted/50 dark:hover:bg-muted/30",
              "transition-colors duration-200",
            )}
            onClick={submitCreateWorkspace}
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            title="Cancel Workspace Creation"
            className={cn(
              "flex items-center justify-center h-8 w-8 rounded-md",
              "text-primary hover:bg-muted/50 dark:hover:bg-muted/30",
              "transition-colors duration-200",
            )}
            onClick={cancelCreateWorkspace}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          className={cn(
            "flex items-center gap-1.5 h-8 px-2.5 rounded-md",
            "text-xs font-medium text-primary",
            "hover:bg-muted/50 dark:hover:bg-muted/30",
            "transition-colors duration-200",
          )}
          onClick={openMenu}
        >
          <span className="max-w-[120px] truncate">
            {activeWorkspace?.name ?? "Default"}
          </span>
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
      )}
    </div>
  );
};
