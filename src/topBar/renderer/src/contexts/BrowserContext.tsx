import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

interface TabInfo {
  id: string;
  title: string;
  url: string;
  kind: "browser" | "agent-chat" | "pending";
  isActive: boolean;
  workspaceId: string;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  topic: string;
  tabCount: number;
  isDefault: boolean;
  isActive?: boolean;
}

interface WorkspaceSnapshot {
  workspaces: WorkspaceInfo[];
  activeWorkspaceId: string;
  tabs: TabInfo[];
  contextDashboardVisible: boolean;
}

interface BrowserContextType {
  tabs: TabInfo[];
  workspaces: WorkspaceInfo[];
  activeWorkspaceId: string;
  activeTab: TabInfo | null;
  contextDashboardVisible: boolean;
  isLoading: boolean;

  createTab: () => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  switchTab: (tabId: string) => Promise<void>;
  refreshTabs: () => Promise<void>;

  createWorkspace: (name: string) => Promise<void>;
  removeWorkspace: (workspaceId: string) => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  moveTabToWorkspace: (tabId: string, workspaceId: string) => Promise<void>;

  submitAddressBar: (tabId: string, input: string) => Promise<void>;
  navigateToUrl: (input: string) => Promise<void>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  reload: () => Promise<void>;

  takeScreenshot: (tabId: string) => Promise<string | null>;
  runJavaScript: (tabId: string, code: string) => Promise<unknown>;
}

const BrowserContext = createContext<BrowserContextType | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useBrowser = (): BrowserContextType => {
  const context = useContext(BrowserContext);
  if (!context) {
    throw new Error("useBrowser must be used within a BrowserProvider");
  }
  return context;
};

const applySnapshot = (
  snapshot: WorkspaceSnapshot,
  setWorkspaces: React.Dispatch<React.SetStateAction<WorkspaceInfo[]>>,
  setActiveWorkspaceId: React.Dispatch<React.SetStateAction<string>>,
  setTabs: React.Dispatch<React.SetStateAction<TabInfo[]>>,
  setContextDashboardVisible: React.Dispatch<React.SetStateAction<boolean>>,
): void => {
  setWorkspaces(snapshot.workspaces);
  setActiveWorkspaceId(snapshot.activeWorkspaceId);
  setTabs(snapshot.tabs);
  setContextDashboardVisible(snapshot.contextDashboardVisible);
};

export const BrowserProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("default");
  const [contextDashboardVisible, setContextDashboardVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const activeTab = tabs.find((tab) => tab.isActive) || null;

  const refreshTabs = useCallback(async () => {
    try {
      const snapshot = await window.topBarAPI.getWorkspaceState();
      applySnapshot(
        snapshot,
        setWorkspaces,
        setActiveWorkspaceId,
        setTabs,
        setContextDashboardVisible,
      );
    } catch (error) {
      console.error("Failed to refresh workspace state:", error);
    }
  }, []);

  const createTab = useCallback(async () => {
    setIsLoading(true);
    try {
      await window.topBarAPI.createTab();
    } catch (error) {
      console.error("Failed to create tab:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const closeTab = useCallback(async (tabId: string) => {
    setIsLoading(true);
    try {
      await window.topBarAPI.closeTab(tabId);
    } catch (error) {
      console.error("Failed to close tab:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const switchTab = useCallback(async (tabId: string) => {
    setIsLoading(true);
    try {
      await window.topBarAPI.switchTab(tabId);
    } catch (error) {
      console.error("Failed to switch tab:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createWorkspace = useCallback(async (name: string) => {
    try {
      await window.topBarAPI.createWorkspace(name);
    } catch (error) {
      console.error("Failed to create workspace:", error);
    }
  }, []);

  const removeWorkspace = useCallback(async (workspaceId: string) => {
    try {
      await window.topBarAPI.removeWorkspace(workspaceId);
    } catch (error) {
      console.error("Failed to remove workspace:", error);
    }
  }, []);

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    setIsLoading(true);
    try {
      await window.topBarAPI.switchWorkspace(workspaceId);
    } catch (error) {
      console.error("Failed to switch workspace:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const moveTabToWorkspace = useCallback(
    async (tabId: string, workspaceId: string) => {
      try {
        await window.topBarAPI.moveTabToWorkspace(tabId, workspaceId);
      } catch (error) {
        console.error("Failed to move tab to workspace:", error);
      }
    },
    [],
  );

  const submitAddressBar = useCallback(async (tabId: string, input: string) => {
    setIsLoading(true);
    try {
      await window.topBarAPI.submitAddressBar(tabId, input);
    } catch (error) {
      console.error("Failed to submit address bar:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const navigateToUrl = useCallback(
    async (input: string) => {
      if (!activeTab || activeTab.kind !== "browser") return;

      let finalUrl = input.trim();
      if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
        if (finalUrl.includes(".") && !finalUrl.includes(" ")) {
          finalUrl = `https://${finalUrl}`;
        } else {
          finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
        }
      }

      setIsLoading(true);
      try {
        await window.topBarAPI.navigateTab(activeTab.id, finalUrl);
      } catch (error) {
        console.error("Failed to navigate:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [activeTab],
  );

  const goBack = useCallback(async () => {
    if (!activeTab || activeTab.kind !== "browser") return;

    try {
      await window.topBarAPI.goBack(activeTab.id);
    } catch (error) {
      console.error("Failed to go back:", error);
    }
  }, [activeTab]);

  const goForward = useCallback(async () => {
    if (!activeTab || activeTab.kind !== "browser") return;

    try {
      await window.topBarAPI.goForward(activeTab.id);
    } catch (error) {
      console.error("Failed to go forward:", error);
    }
  }, [activeTab]);

  const reload = useCallback(async () => {
    if (!activeTab || activeTab.kind !== "browser") return;

    try {
      await window.topBarAPI.reload(activeTab.id);
    } catch (error) {
      console.error("Failed to reload:", error);
    }
  }, [activeTab]);

  const takeScreenshot = useCallback(async (tabId: string) => {
    try {
      return await window.topBarAPI.tabScreenshot(tabId);
    } catch (error) {
      console.error("Failed to take screenshot:", error);
      return null;
    }
  }, []);

  const runJavaScript = useCallback(async (tabId: string, code: string) => {
    try {
      return await window.topBarAPI.tabRunJs(tabId, code);
    } catch (error) {
      console.error("Failed to run JavaScript:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshTabs();
  }, [refreshTabs]);

  useEffect(() => {
    const handleSnapshot = (snapshot: WorkspaceSnapshot): void => {
      applySnapshot(
        snapshot,
        setWorkspaces,
        setActiveWorkspaceId,
        setTabs,
        setContextDashboardVisible,
      );
    };

    window.topBarAPI.onTabsUpdated(setTabs);
    window.topBarAPI.onWorkspaceStateUpdated(handleSnapshot);

    return () => {
      window.topBarAPI.removeTabsUpdatedListener();
      window.topBarAPI.removeWorkspaceStateUpdatedListener();
    };
  }, []);

  const value: BrowserContextType = {
    tabs,
    workspaces,
    activeWorkspaceId,
    activeTab,
    contextDashboardVisible,
    isLoading,
    createTab,
    closeTab,
    switchTab,
    refreshTabs,
    createWorkspace,
    removeWorkspace,
    switchWorkspace,
    moveTabToWorkspace,
    submitAddressBar,
    navigateToUrl,
    goBack,
    goForward,
    reload,
    takeScreenshot,
    runJavaScript,
  };

  return (
    <BrowserContext.Provider value={value}>{children}</BrowserContext.Provider>
  );
};
