import {
  ipcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
  WebContents,
} from "electron";
import type { Window } from "../Window";
import { eventDatabase } from "./database";
import type { Event } from "./types";

type EventMetadata =
  | { sender: number; kind: "invoke" | "on" }
  | { kind: "menu"; source: "application-menu" };

export class EventManager {
  private mainWindow: Window;
  private removeTabsChangedListener: (() => void) | undefined;

  constructor(mainWindow: Window) {
    this.mainWindow = mainWindow;
    this.removeTabsChangedListener = this.mainWindow.onTabsChanged(() =>
      this.broadcastTabsUpdated(),
    );
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Tab management events
    this.handleTabEvents();

    // Sidebar events
    this.handleSidebarEvents();

    // Page content events
    this.handlePageContentEvents();

    // Dark mode events
    this.handleDarkModeEvents();

    // Debug events
    this.handleDebugEvents();

    // Database query (not wrapped to avoid feedback loop)
    ipcMain.handle("db-query", (_e, sql: string, params: unknown[] = []) =>
      eventDatabase.query(sql, params),
    );
  }

  private handle<T extends unknown[]>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: T) => unknown,
  ): void {
    ipcMain.handle(channel, async (event, ...args) => {
      this.logAndBroadcast(channel, args, {
        sender: event.sender.id,
        kind: "invoke",
      });
      return await handler(event, ...(args as T));
    });
  }

  private on<T extends unknown[]>(
    channel: string,
    listener: (event: IpcMainEvent, ...args: T) => void,
  ): void {
    ipcMain.on(channel, (event, ...args) => {
      this.logAndBroadcast(channel, args, {
        sender: event.sender.id,
        kind: "on",
      });
      listener(event, ...(args as T));
    });
  }

  private logAndBroadcast(
    channel: string,
    args: unknown[],
    metadata: EventMetadata,
  ): void {
    const event = eventDatabase.publish(
      channel,
      1,
      args,
      "rpc-args",
      metadata,
      "rpc-meta",
    );
    this.broadcastEvent(event);
  }

  public publishMenuAction(channel: string, args: unknown[] = []): void {
    this.logAndBroadcast(channel, args, {
      kind: "menu",
      source: "application-menu",
    });
  }

  private broadcastEvent(event: Event): void {
    this.mainWindow.topBar.view.webContents.send("event-logged", event);
    this.mainWindow.eventPanel.view.webContents.send("event-logged", event);
    this.mainWindow.sidebar.view.webContents.send("event-logged", event);
  }

  private getTabsSnapshot(): {
    id: string;
    title: string;
    url: string;
    isActive: boolean;
  }[] {
    const activeTabId = this.mainWindow.activeTab?.id;
    return this.mainWindow.allTabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      isActive: activeTabId === tab.id,
    }));
  }

  private broadcastTabsUpdated(): void {
    this.mainWindow.topBar.view.webContents.send(
      "tabs-updated",
      this.getTabsSnapshot(),
    );
  }

  private handleTabEvents(): void {
    // Create new tab
    this.handle("create-tab", (_, url?: string) => {
      const newTab = this.mainWindow.createTab(url);
      return { id: newTab.id, title: newTab.title, url: newTab.url };
    });

    // Close tab
    this.handle("close-tab", (_, id: string) => {
      this.mainWindow.closeTab(id);
    });

    // Switch tab
    this.handle("switch-tab", (_, id: string) => {
      this.mainWindow.switchActiveTab(id);
    });

    // Get tabs
    this.handle("get-tabs", () => {
      return this.getTabsSnapshot();
    });

    // Navigation (for compatibility with existing code)
    this.handle("navigate-to", (_, url: string) => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.loadURL(url);
      }
    });

    this.handle("navigate-tab", async (_, tabId: string, url: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        await tab.loadURL(url);
        return true;
      }
      return false;
    });

    this.handle("go-back", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.goBack();
      }
    });

    this.handle("go-forward", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.goForward();
      }
    });

    this.handle("reload", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.reload();
      }
    });

    // Tab-specific navigation handlers
    this.handle("tab-go-back", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.goBack();
        return true;
      }
      return false;
    });

    this.handle("tab-go-forward", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.goForward();
        return true;
      }
      return false;
    });

    this.handle("tab-reload", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.reload();
        return true;
      }
      return false;
    });

    this.handle("tab-screenshot", async (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        const image = await tab.screenshot();
        return image.toDataURL();
      }
      return null;
    });

    this.handle("tab-run-js", async (_, tabId: string, code: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        return await tab.runJs(code);
      }
      return null;
    });

    // Tab info
    this.handle("get-active-tab-info", () => {
      const activeTab = this.mainWindow.activeTab;
      if (activeTab) {
        return {
          id: activeTab.id,
          url: activeTab.url,
          title: activeTab.title,
          canGoBack: activeTab.webContents.canGoBack(),
          canGoForward: activeTab.webContents.canGoForward(),
        };
      }
      return null;
    });
  }

  private handleSidebarEvents(): void {
    // Toggle sidebar
    this.handle("toggle-sidebar", () => {
      this.mainWindow.sidebar.toggle();
      this.mainWindow.updateAllBounds();
      return true;
    });

    // Chat message
    this.handle(
      "sidebar-chat-message",
      async (_, request: { message: string; messageId: string }) => {
        // The LLMClient now handles getting the screenshot and context directly
        await this.mainWindow.sidebar.client.sendChatMessage(request);
      },
    );

    // Clear chat
    this.handle("sidebar-clear-chat", () => {
      this.mainWindow.sidebar.client.clearMessages();
      return true;
    });

    // Get messages
    this.handle("sidebar-get-messages", () => {
      return this.mainWindow.sidebar.client.getMessages();
    });
  }

  private handlePageContentEvents(): void {
    // Get page content
    this.handle("get-page-content", async () => {
      if (this.mainWindow.activeTab) {
        try {
          return await this.mainWindow.activeTab.getTabHtml();
        } catch (error) {
          console.error("Error getting page content:", error);
          return null;
        }
      }
      return null;
    });

    // Get page text
    this.handle("get-page-text", async () => {
      if (this.mainWindow.activeTab) {
        try {
          return await this.mainWindow.activeTab.getTabText();
        } catch (error) {
          console.error("Error getting page text:", error);
          return null;
        }
      }
      return null;
    });

    // Get current URL
    this.handle("get-current-url", () => {
      if (this.mainWindow.activeTab) {
        return this.mainWindow.activeTab.url;
      }
      return null;
    });
  }

  private handleDarkModeEvents(): void {
    // Dark mode broadcasting
    this.on("dark-mode-changed", (event, isDarkMode) => {
      this.broadcastDarkMode(event.sender, isDarkMode as boolean);
    });
  }

  private handleDebugEvents(): void {
    // Ping test
    this.on("ping", () => console.log("pong"));
  }

  private broadcastDarkMode(sender: WebContents, isDarkMode: boolean): void {
    // Send to topbar
    if (this.mainWindow.topBar.view.webContents !== sender) {
      this.mainWindow.topBar.view.webContents.send(
        "dark-mode-updated",
        isDarkMode,
      );
    }

    // Send to event panel
    if (this.mainWindow.eventPanel.view.webContents !== sender) {
      this.mainWindow.eventPanel.view.webContents.send(
        "dark-mode-updated",
        isDarkMode,
      );
    }

    // Send to sidebar
    if (this.mainWindow.sidebar.view.webContents !== sender) {
      this.mainWindow.sidebar.view.webContents.send(
        "dark-mode-updated",
        isDarkMode,
      );
    }

    // Send to all tabs
    this.mainWindow.allTabs.forEach((tab) => {
      if (tab.webContents !== sender) {
        tab.webContents.send("dark-mode-updated", isDarkMode);
      }
    });
  }

  // Clean up event listeners
  public cleanup(): void {
    this.removeTabsChangedListener?.();
    ipcMain.removeAllListeners();
  }
}
