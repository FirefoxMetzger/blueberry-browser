import {
  dialog,
  ipcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
  Menu,
  WebContents,
} from "electron";
import type { Window } from "../main/Window";
import type { AgentChatView } from "../tabAgent/main";
import type { WorkspaceManager } from "../workspaces/WorkspaceManager";
import { buildGrepHighlightScript } from "../main/grepMatchHighlight";
import type { GrepNavigationRequest } from "../tabAgent/types";
import { DEFAULT_WORKSPACE_TOPIC, workspaceTopic } from "../workspaces/types";
import { eventDatabase } from "./database";
import type { Event } from "./types";

const DEFAULT_EVENT_TOPIC = DEFAULT_WORKSPACE_TOPIC;

type EventMetadata =
  | { sender: number; kind: "invoke" | "on" }
  | { kind: "menu"; source: "application-menu" };
type EventTopicResolver = (...args: unknown[]) => string;
type EventHandlerOptions = {
  skipRpcLog?: boolean;
  topic?: string | EventTopicResolver;
};

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
    this.handleAgentChatEvents();

    ipcMain.handle("db-query", (_e, sql: string, params?: unknown) => {
      const boundParams = Array.isArray(params)
        ? params
        : params !== undefined
          ? [params]
          : [];
      return eventDatabase.query(sql, boundParams);
    });

    ipcMain.handle("get-active-workspace-context", () => {
      return this.getActiveWorkspaceContext();
    });
  }

  private getActiveWorkspaceContext(): { topic: string; name: string } {
    const windowId = this.mainWindow.id;
    const workspaceId = this.workspaceManager.getSelectedWorkspaceId(windowId);
    return {
      topic: this.workspaceManager.getWorkspaceTopic(workspaceId),
      name: this.workspaceManager.getWorkspaceName(workspaceId),
    };
  }

  private handle<T extends unknown[]>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: T) => unknown,
    options?: EventHandlerOptions,
  ): void {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!options?.skipRpcLog) {
        this.logAndBroadcast(
          channel,
          args,
          {
            sender: event.sender.id,
            kind: "invoke",
          },
          this.resolveEventTopic(options?.topic, args),
        );
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
    topic = DEFAULT_EVENT_TOPIC,
  ): void {
    const event = eventDatabase.publish(
      topic,
      1,
      args,
      channel,
      metadata,
      "rpc-meta",
    );
    this.broadcastEvent(event);
  }

  public publishMenuAction(channel: string, args: unknown[] = []): void {
    this.logAndBroadcast(
      channel,
      args,
      {
        kind: "menu",
        source: "application-menu",
      },
      this.getMenuActionTopic(channel),
    );
  }

  private resolveEventTopic(
    topic?: string | EventTopicResolver,
    args: unknown[] = [],
  ): string {
    return typeof topic === "function"
      ? topic(...args)
      : (topic ?? DEFAULT_EVENT_TOPIC);
  }

  private getActiveWorkspaceTopic(): string {
    return this.workspaceManager.getActiveWorkspaceTopic(this.mainWindow.id);
  }

  private getActiveTabWorkspaceTopic(): string {
    const activeTabId = this.mainWindow.activeTab?.id;
    return activeTabId
      ? this.getTabWorkspaceTopic(activeTabId)
      : this.getActiveWorkspaceTopic();
  }

  private getTabWorkspaceTopic(tabId: unknown): string {
    if (typeof tabId !== "string") {
      return this.getActiveTabWorkspaceTopic();
    }

    return (
      this.workspaceManager.getTabWorkspaceTopic(this.mainWindow.id, tabId) ??
      this.getActiveWorkspaceTopic()
    );
  }

  private getMenuActionTopic(channel: string): string {
    switch (channel) {
      case "close-tab":
      case "reload":
      case "force-reload":
      case "toggle-dev-tools":
      case "go-back":
      case "go-forward":
        return this.getActiveTabWorkspaceTopic();
      default:
        return this.getActiveWorkspaceTopic();
    }
  }

  public broadcastEvent(event: Event): void {
    this.mainWindow.topBar.view.webContents.send("event-logged", event);
    this.mainWindow.contextDashboard.view.webContents.send(
      "event-logged",
      event,
    );
    for (const chat of this.mainWindow.allAgentChats) {
      chat.view.webContents.send("event-logged", event);
    }
  }

  public broadcastWorkspaceState(window?: Window): void {
    const targetWindow = window ?? this.mainWindow;
    const snapshot = this.workspaceManager.getSnapshot(targetWindow.id);
    const activeWorkspace = snapshot.workspaces.find(
      (workspace) => workspace.id === snapshot.activeWorkspaceId,
    );

    targetWindow.topBar.view.webContents.send("tabs-updated", snapshot.tabs);
    targetWindow.topBar.view.webContents.send(
      "workspace-state-updated",
      snapshot,
    );
    targetWindow.contextDashboard.view.webContents.send(
      "workspace-context-updated",
      {
        topic: activeWorkspace?.topic ?? DEFAULT_EVENT_TOPIC,
        name: activeWorkspace?.name ?? "Default",
      },
    );
  }

  private broadcastWorkspaceStateInternal(): void {
    this.broadcastWorkspaceState();
  }

  private handleTabEvents(): void {
    const windowId = (): string => this.mainWindow.id;
    const activeWorkspaceTopic = (): string => this.getActiveWorkspaceTopic();
    const activeTabWorkspaceTopic = (): string =>
      this.getActiveTabWorkspaceTopic();
    const tabWorkspaceTopic = (tabId: unknown): string =>
      this.getTabWorkspaceTopic(tabId);

    this.handle(
      "create-tab",
      () => {
        return this.workspaceManager.createTab(windowId());
      },
      { topic: activeWorkspaceTopic },
    );

    this.handle(
      "close-tab",
      (_, id: string) => {
        this.workspaceManager.closeTab(windowId(), id);
      },
      { topic: tabWorkspaceTopic },
    );

    this.handle(
      "switch-tab",
      (_, id: string) => {
        this.workspaceManager.switchTab(windowId(), id);
      },
      { topic: tabWorkspaceTopic },
    );

    this.handle(
      "navigate-grep-match",
      async (_, request: GrepNavigationRequest) => {
        const { tabId, sourceType, pattern, caseInsensitive, lineText } =
          request;
        const wid = windowId();

        const switched = this.workspaceManager.switchTab(wid, tabId);
        if (!switched) {
          return { success: false, switched: false, highlighted: false };
        }

        await new Promise((resolve) => setTimeout(resolve, 200));

        const script = buildGrepHighlightScript({
          pattern,
          caseInsensitive,
          lineText,
        });

        if (sourceType === "agent-chat") {
          const chat = this.mainWindow.getAgentChat(tabId);
          if (!chat) {
            return { success: true, switched: true, highlighted: false };
          }

          const result = await chat.view.webContents.executeJavaScript(script);
          return {
            success: true,
            switched: true,
            highlighted: Boolean(
              result &&
              typeof result === "object" &&
              "success" in result &&
              result.success,
            ),
          };
        }

        let tab = this.mainWindow.getTab(tabId);
        if (!tab) {
          tab = this.workspaceManager.ensureBrowserTabMaterialized(wid, tabId);
        }
        if (!tab) {
          return { success: true, switched: true, highlighted: false };
        }

        const result = await tab.runJs(script);
        return {
          success: true,
          switched: true,
          highlighted: Boolean(
            result &&
            typeof result === "object" &&
            "success" in result &&
            result.success,
          ),
        };
      },
      { topic: tabWorkspaceTopic },
    );

    this.handle(
      "get-tabs",
      () => {
        return this.workspaceManager.getSnapshot(windowId()).tabs;
      },
      { topic: activeWorkspaceTopic },
    );

    this.handle(
      "submit-address-bar",
      (_, tabId: string, input: string) => {
        return this.workspaceManager.submitAddressBar(windowId(), tabId, input);
      },
      { topic: tabWorkspaceTopic },
    );

    this.handle(
      "navigate-to",
      (_, url: string) => {
        const activeTab = this.mainWindow.activeTab;
        if (activeTab) {
          this.workspaceManager.handleNavigateTab(
            windowId(),
            activeTab.id,
            url,
          );
        }
      },
      { topic: activeTabWorkspaceTopic },
    );

    this.handle(
      "navigate-tab",
      async (_, tabId: string, url: string) => {
        this.workspaceManager.handleNavigateTab(windowId(), tabId, url);
        return true;
      },
      { topic: tabWorkspaceTopic },
    );

    this.handle(
      "go-back",
      () => {
        this.mainWindow.activeTab?.goBack();
      },
      { topic: activeTabWorkspaceTopic },
    );

    this.handle(
      "go-forward",
      () => {
        this.mainWindow.activeTab?.goForward();
      },
      { topic: activeTabWorkspaceTopic },
    );

    this.handle(
      "reload",
      () => {
        this.mainWindow.activeTab?.reload();
      },
      { topic: activeTabWorkspaceTopic },
    );

    this.handle(
      "tab-go-back",
      (_, tabId: string) => {
        this.mainWindow.getTab(tabId)?.goBack();
        return true;
      },
      { topic: tabWorkspaceTopic },
    );

    this.handle(
      "tab-go-forward",
      (_, tabId: string) => {
        this.mainWindow.getTab(tabId)?.goForward();
        return true;
      },
      { topic: tabWorkspaceTopic },
    );

    this.handle(
      "tab-reload",
      (_, tabId: string) => {
        this.mainWindow.getTab(tabId)?.reload();
        return true;
      },
      { topic: tabWorkspaceTopic },
    );

    this.handle(
      "tab-screenshot",
      async (_, tabId: string) => {
        const tab = this.mainWindow.getTab(tabId);
        if (tab) {
          const image = await tab.screenshot();
          return image.toDataURL();
        }
        return null;
      },
      { topic: tabWorkspaceTopic },
    );

    this.handle(
      "tab-run-js",
      async (_, tabId: string, code: string) => {
        const tab = this.mainWindow.getTab(tabId);
        if (tab) {
          return await tab.runJs(code);
        }
        return null;
      },
      { topic: tabWorkspaceTopic },
    );
  }

  private handleWorkspaceEvents(): void {
    const windowId = (): string => this.mainWindow.id;
    const activeWorkspaceTopic = (): string => this.getActiveWorkspaceTopic();
    const tabWorkspaceTopic = (tabId: unknown): string =>
      this.getTabWorkspaceTopic(tabId);
    const topicForWorkspaceId = (workspaceId: unknown): string =>
      typeof workspaceId === "string"
        ? this.workspaceManager.getWorkspaceTopic(workspaceId)
        : activeWorkspaceTopic();
    const topicForWorkspaceName = (name: unknown): string => {
      const trimmed = typeof name === "string" ? name.trim() : "";
      return trimmed ? workspaceTopic(trimmed) : DEFAULT_EVENT_TOPIC;
    };

    this.handle(
      "get-workspace-state",
      () => this.workspaceManager.getSnapshot(windowId()),
      { skipRpcLog: true },
    );

    this.handle(
      "create-workspace",
      (_, name: string) => {
        return this.workspaceManager.createWorkspace(windowId(), name);
      },
      { topic: topicForWorkspaceName },
    );

    this.handle(
      "remove-workspace",
      (_, workspaceId: string) => {
        return this.workspaceManager.removeWorkspace(windowId(), workspaceId);
      },
      { topic: topicForWorkspaceId },
    );

    this.handle(
      "switch-workspace",
      (_, workspaceId: string) => {
        return this.workspaceManager.switchWorkspace(windowId(), workspaceId);
      },
      { topic: topicForWorkspaceId },
    );

    this.handle(
      "move-tab-to-workspace",
      (_, tabId: string, workspaceId: string) => {
        return this.workspaceManager.moveTabToWorkspace(
          windowId(),
          tabId,
          workspaceId,
        );
      },
      { topic: tabWorkspaceTopic },
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
      "show-context-dashboard",
      () => {
        this.workspaceManager.showContextDashboard(windowId());
        return true;
      },
      { topic: activeWorkspaceTopic },
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

  private handleAgentChatEvents(): void {
    this.handle(
      "agent-chat-message",
      async (event, request: { message: string; messageId: string }) => {
        const chat = this.getAgentChatFromSender(event.sender);
        if (!chat) {
          return;
        }

        this.ensureAgentChatConfigured(chat);

        const topic =
          this.workspaceManager.getTabWorkspaceTopic(
            this.mainWindow.id,
            chat.id,
          ) ?? this.getActiveWorkspaceTopic();

        const payload = {
          tabId: chat.id,
          message: request.message,
          messageId: request.messageId,
        };

        const loggedEvent = eventDatabase.publish(
          topic,
          1,
          payload,
          "agent-chat-message",
          { sender: event.sender.id, kind: "invoke" },
          "rpc-meta",
        );
        this.broadcastEvent(loggedEvent);

        await chat.client.sendChatMessage(request, loggedEvent.id);
      },
      { skipRpcLog: true },
    );

    this.handle(
      "agent-chat-clear-chat",
      (event) => {
        const chat = this.getAgentChatFromSender(event.sender);
        if (!chat) {
          return false;
        }

        this.ensureAgentChatConfigured(chat);
        chat.client.clearMessages();

        const topic =
          this.workspaceManager.getTabWorkspaceTopic(
            this.mainWindow.id,
            chat.id,
          ) ?? this.getActiveWorkspaceTopic();

        const loggedEvent = eventDatabase.publish(
          topic,
          1,
          { tabId: chat.id },
          "agent-chat-clear-chat",
          { sender: event.sender.id, kind: "invoke" },
          "rpc-meta",
        );
        this.broadcastEvent(loggedEvent);

        return true;
      },
      { skipRpcLog: true },
    );

    this.handle(
      "agent-chat-get-context",
      (event) => {
        const chat = this.getAgentChatFromSender(event.sender);
        if (!chat) {
          return null;
        }

        const topic =
          this.workspaceManager.getTabWorkspaceTopic(
            this.mainWindow.id,
            chat.id,
          ) ?? this.getActiveWorkspaceTopic();

        return { tabId: chat.id, topic };
      },
      { skipRpcLog: true },
    );
  }

  private getAgentChatFromSender(sender: WebContents): AgentChatView | null {
    for (const chat of this.mainWindow.allAgentChats) {
      if (chat.view.webContents === sender) {
        return chat;
      }
    }
    return null;
  }

  private ensureAgentChatConfigured(chat: AgentChatView): void {
    this.workspaceManager.configureAgentChatClient(this.mainWindow.id, chat.id);
  }

  public cleanup(): void {
    this.removeTabsChangedListener?.();
    this.removeWorkspaceChangedListener?.();
    ipcMain.removeAllListeners();
  }
}
