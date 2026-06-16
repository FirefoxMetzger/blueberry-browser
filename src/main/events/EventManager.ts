import {
  dialog,
  ipcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
  Menu,
} from "electron";
import type { Window } from "../Window";
import type { WorkspaceManager } from "../workspaces/WorkspaceManager";
import { eventDatabase } from "./database";
import type { Event } from "./types";

const DEFAULT_EVENT_TOPIC = "default";

type EventMetadata =
  | { sender: number; kind: "invoke" | "on" }
  | { kind: "menu"; source: "application-menu" };

interface PopupPoint {
  x: number;
  y: number;
}

export class EventManager {
  private mainWindow: Window;
  private workspaceManager: WorkspaceManager;
  private removeTabsChangedListener: (() => void) | undefined;
  private removeWorkspaceChangedListener: (() => void) | undefined;

  constructor(mainWindow: Window, workspaceManager: WorkspaceManager) {
    this.mainWindow = mainWindow;
    this.workspaceManager = workspaceManager;
    this.removeTabsChangedListener = this.mainWindow.onTabsChanged(() =>
      this.broadcastWorkspaceStateInternal(),
    );
    this.removeWorkspaceChangedListener = this.workspaceManager.onStateChanged(
      () => this.broadcastWorkspaceStateInternal(),
    );
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.handleTabEvents();
    this.handleWorkspaceEvents();
    this.handleSidebarEvents();
    this.handlePageContentEvents();
    this.handleDebugEvents();

    ipcMain.handle("db-query", (_e, sql: string, params?: unknown) => {
      const boundParams = Array.isArray(params)
        ? params
        : params !== undefined
          ? [params]
          : [];
      return eventDatabase.query(sql, boundParams);
    });
  }

  private handle<T extends unknown[]>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: T) => unknown,
    options?: { skipRpcLog?: boolean },
  ): void {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!options?.skipRpcLog) {
        this.logAndBroadcast(channel, args, {
          sender: event.sender.id,
          kind: "invoke",
        });
      }
      return await handler(event, ...(args as T));
    });
  }

  public on<T extends unknown[]>(
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
      DEFAULT_EVENT_TOPIC,
      1,
      args,
      channel,
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

  public broadcastEvent(event: Event): void {
    this.mainWindow.topBar.view.webContents.send("event-logged", event);
    this.mainWindow.eventPanel.view.webContents.send("event-logged", event);
    this.mainWindow.sidebar.view.webContents.send("event-logged", event);
  }

  public broadcastWorkspaceState(window?: Window): void {
    const targetWindow = window ?? this.mainWindow;
    const snapshot = this.workspaceManager.getSnapshot(targetWindow.id);
    targetWindow.topBar.view.webContents.send("tabs-updated", snapshot.tabs);
    targetWindow.topBar.view.webContents.send(
      "workspace-state-updated",
      snapshot,
    );
  }

  private broadcastWorkspaceStateInternal(): void {
    this.broadcastWorkspaceState();
  }

  private handleTabEvents(): void {
    const windowId = (): string => this.mainWindow.id;

    this.handle("create-tab", (_, url?: string) => {
      return this.workspaceManager.createTab(
        windowId(),
        url ?? "https://www.google.com",
      );
    });

    this.handle("close-tab", (_, id: string) => {
      this.workspaceManager.closeTab(windowId(), id);
    });

    this.handle("switch-tab", (_, id: string) => {
      this.workspaceManager.switchTab(windowId(), id);
    });

    this.handle("get-tabs", () => {
      return this.workspaceManager.getSnapshot(windowId()).tabs;
    });

    this.handle("navigate-to", (_, url: string) => {
      const activeTab = this.mainWindow.activeTab;
      if (activeTab) {
        this.workspaceManager.handleNavigateTab(windowId(), activeTab.id, url);
      }
    });

    this.handle("navigate-tab", async (_, tabId: string, url: string) => {
      this.workspaceManager.handleNavigateTab(windowId(), tabId, url);
      return true;
    });

    this.handle("go-back", () => {
      this.mainWindow.activeTab?.goBack();
    });

    this.handle("go-forward", () => {
      this.mainWindow.activeTab?.goForward();
    });

    this.handle("reload", () => {
      this.mainWindow.activeTab?.reload();
    });

    this.handle("tab-go-back", (_, tabId: string) => {
      this.mainWindow.getTab(tabId)?.goBack();
      return true;
    });

    this.handle("tab-go-forward", (_, tabId: string) => {
      this.mainWindow.getTab(tabId)?.goForward();
      return true;
    });

    this.handle("tab-reload", (_, tabId: string) => {
      this.mainWindow.getTab(tabId)?.reload();
      return true;
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

  private handleWorkspaceEvents(): void {
    const windowId = (): string => this.mainWindow.id;

    this.handle(
      "get-workspaces",
      () => this.workspaceManager.getWorkspaces(windowId()),
      { skipRpcLog: true },
    );

    this.handle(
      "get-workspace-state",
      () => this.workspaceManager.getSnapshot(windowId()),
      { skipRpcLog: true },
    );

    this.handle("create-workspace", (_, name: string) => {
      return this.workspaceManager.createWorkspace(windowId(), name);
    });

    this.handle("remove-workspace", (_, workspaceId: string) => {
      return this.workspaceManager.removeWorkspace(windowId(), workspaceId);
    });

    this.handle("switch-workspace", (_, workspaceId: string) => {
      return this.workspaceManager.switchWorkspace(windowId(), workspaceId);
    });

    this.handle(
      "move-tab-to-workspace",
      (_, tabId: string, workspaceId: string) => {
        return this.workspaceManager.moveTabToWorkspace(
          windowId(),
          tabId,
          workspaceId,
        );
      },
    );

    this.handle(
      "open-workspace-menu",
      (_, point?: PopupPoint) => {
        this.showWorkspaceMenu(point);
        return true;
      },
      { skipRpcLog: true },
    );

    this.handle(
      "open-tab-context-menu",
      (_, tabId: string, point?: PopupPoint) => {
        this.showTabContextMenu(tabId, point);
        return true;
      },
      { skipRpcLog: true },
    );
  }

  private showWorkspaceMenu(point?: PopupPoint): void {
    const snapshot = this.workspaceManager.getSnapshot(this.mainWindow.id);
    const namedWorkspaces = snapshot.workspaces.filter(
      (workspace) => !workspace.isDefault,
    );

    const workspaceItems: Electron.MenuItemConstructorOptions[] =
      snapshot.workspaces.map((workspace) => ({
        label: `${workspace.name} (${workspace.tabCount})`,
        type: "radio",
        checked: workspace.id === snapshot.activeWorkspaceId,
        click: () => {
          this.workspaceManager.switchWorkspace(
            this.mainWindow.id,
            workspace.id,
          );
        },
      }));

    const removeItems: Electron.MenuItemConstructorOptions[] =
      namedWorkspaces.map((workspace) => ({
        label: workspace.name,
        click: () => {
          const response = dialog.showMessageBoxSync(
            this.mainWindow.baseWindow,
            {
              type: "warning",
              buttons: ["Remove", "Cancel"],
              defaultId: 1,
              cancelId: 1,
              message: `Remove workspace "${workspace.name}"?`,
              detail:
                "Tabs in this workspace will be removed from the workspace.",
            },
          );

          if (response === 0) {
            this.workspaceManager.removeWorkspace(
              this.mainWindow.id,
              workspace.id,
            );
          }
        },
      }));

    const template: Electron.MenuItemConstructorOptions[] = [
      ...workspaceItems,
      { type: "separator" },
      {
        label: "New Workspace...",
        click: () => {
          this.mainWindow.topBar.view.webContents.send(
            "workspace-create-requested",
          );
        },
      },
    ];

    if (removeItems.length > 0) {
      template.push({
        label: "Remove Workspace",
        submenu: removeItems,
      });
    }

    this.popupMenu(template, point);
  }

  private showTabContextMenu(tabId: string, point?: PopupPoint): void {
    const snapshot = this.workspaceManager.getSnapshot(this.mainWindow.id);
    const moveTargets = snapshot.workspaces.filter(
      (workspace) =>
        !workspace.isDefault && workspace.id !== snapshot.activeWorkspaceId,
    );

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: "Move to Workspace",
        enabled: moveTargets.length > 0,
        submenu:
          moveTargets.length > 0
            ? moveTargets.map((workspace) => ({
                label: workspace.name,
                click: () => {
                  this.workspaceManager.moveTabToWorkspace(
                    this.mainWindow.id,
                    tabId,
                    workspace.id,
                  );
                },
              }))
            : [{ label: "No other workspace", enabled: false }],
      },
    ];

    this.popupMenu(template, point);
  }

  private popupMenu(
    template: Electron.MenuItemConstructorOptions[],
    point?: PopupPoint,
  ): void {
    const menu = Menu.buildFromTemplate(template);

    if (point) {
      menu.popup({
        window: this.mainWindow.baseWindow,
        x: Math.round(point.x),
        y: Math.round(point.y),
      });
      return;
    }

    menu.popup({
      window: this.mainWindow.baseWindow,
    });
  }

  private handleSidebarEvents(): void {
    this.handle("toggle-sidebar", () => {
      this.mainWindow.sidebar.toggle();
      this.mainWindow.updateAllBounds();
      return true;
    });

    this.handle(
      "sidebar-chat-message",
      async (_, request: { message: string; messageId: string }) => {
        await this.mainWindow.sidebar.client.sendChatMessage(request);
      },
    );

    this.handle("sidebar-clear-chat", () => {
      this.mainWindow.sidebar.client.clearMessages();
      return true;
    });

    this.handle("sidebar-get-messages", () => {
      return this.mainWindow.sidebar.client.getMessages();
    });
  }

  private handlePageContentEvents(): void {
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

    this.handle("get-current-url", () => {
      return this.mainWindow.activeTab?.url ?? null;
    });
  }

  private handleDebugEvents(): void {
    this.on("ping", () => console.log("pong"));
  }

  public cleanup(): void {
    this.removeTabsChangedListener?.();
    this.removeWorkspaceChangedListener?.();
    ipcMain.removeAllListeners();
  }
}
