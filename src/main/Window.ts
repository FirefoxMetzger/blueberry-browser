import { randomUUID } from "crypto";
import { BaseWindow, shell } from "electron";
import { Tab } from "./Tab";
import { TopBar } from "../topBar/main";
import { AgentChatView } from "../agentChat/main";
import { ContextDashboard } from "../contextDashboard/main";
import type { TabHistorySnapshot } from "../workspaces/types";

export type TabStateCallback = (
  tabId: string,
  title: string,
  url: string,
) => void;

export class Window {
  readonly id: string;
  private _baseWindow: BaseWindow;
  private tabsMap: Map<string, Tab> = new Map();
  private agentChatsMap: Map<string, AgentChatView> = new Map();
  private activeTabId: string | null = null;
  private activeAgentChatId: string | null = null;
  private _topBar: TopBar;
  private _contextDashboard: ContextDashboard;
  private contextDashboardVisible = false;
  private tabsChangedListeners = new Set<() => void>();
  private tabStateCallbacks = new Map<string, TabStateCallback>();

  constructor() {
    this.id = randomUUID();

    this._baseWindow = new BaseWindow({
      width: 1000,
      height: 800,
      show: true,
      autoHideMenuBar: false,
      titleBarStyle: "hidden",
      ...(process.platform !== "darwin" ? { titleBarOverlay: true } : {}),
      trafficLightPosition: { x: 15, y: 13 },
    });

    this._baseWindow.setMinimumSize(1000, 800);

    this._topBar = new TopBar(this._baseWindow);
    this._contextDashboard = new ContextDashboard(this._baseWindow);

    this._baseWindow.on("resize", () => {
      this.updateAllBounds();
      const bounds = this._baseWindow.getBounds();
      if (this.activeTab) {
        this.activeTab.webContents.send("window-resized", {
          width: bounds.width,
          height: bounds.height,
        });
      }
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this._baseWindow.on("closed", () => {
      this.tabsMap.forEach((tab) => tab.destroy());
      this.tabsMap.clear();
      this.agentChatsMap.forEach((chat) => chat.destroy());
      this.agentChatsMap.clear();
      this.tabStateCallbacks.clear();
    });
  }

  get window(): BaseWindow {
    return this._baseWindow;
  }

  get activeTab(): Tab | null {
    if (this.activeTabId) {
      return this.tabsMap.get(this.activeTabId) || null;
    }
    return null;
  }

  get activeWorkspaceItemId(): string | null {
    return this.activeAgentChatId ?? this.activeTabId;
  }

  get allTabs(): Tab[] {
    return Array.from(this.tabsMap.values());
  }

  get allAgentChats(): AgentChatView[] {
    return Array.from(this.agentChatsMap.values());
  }

  get tabCount(): number {
    return this.tabsMap.size;
  }

  getTabRecordUrl(tabId: string): string | undefined {
    return this.tabsMap.get(tabId)?.url;
  }

  materializeTab(
    tabId: string,
    url: string,
    onStateChanged?: TabStateCallback,
    title?: string,
    history?: TabHistorySnapshot,
  ): Tab {
    const existing = this.tabsMap.get(tabId);
    if (existing) {
      return existing;
    }

    const callback: TabStateCallback = (id, changedTitle, changedUrl) => {
      onStateChanged?.(id, changedTitle, changedUrl);
    };

    const tab = new Tab(tabId, url, callback, title, history);

    tab.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: "deny" };
    });

    this._baseWindow.contentView.addChildView(tab.view);
    this.setContentBounds(tab.view);
    tab.hide();

    this.tabsMap.set(tabId, tab);
    if (onStateChanged) {
      this.tabStateCallbacks.set(tabId, onStateChanged);
    }

    this.notifyTabsChanged();
    return tab;
  }

  materializeAgentChat(tabId: string): AgentChatView {
    const existing = this.agentChatsMap.get(tabId);
    if (existing) {
      return existing;
    }

    const chat = new AgentChatView(this._baseWindow, tabId);
    chat.client.setWindow(this);
    this.agentChatsMap.set(tabId, chat);
    chat.hide();
    this.notifyTabsChanged();
    return chat;
  }

  destroyTabView(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    this._baseWindow.contentView.removeChildView(tab.view);
    tab.destroy();
    this.tabsMap.delete(tabId);
    this.tabStateCallbacks.delete(tabId);

    if (this.activeTabId === tabId) {
      this.activeTabId = null;
    }

    this.notifyTabsChanged();
    return true;
  }

  destroyAgentChatView(tabId: string): boolean {
    const chat = this.agentChatsMap.get(tabId);
    if (!chat) {
      return false;
    }

    this._baseWindow.contentView.removeChildView(chat.view);
    chat.destroy();
    this.agentChatsMap.delete(tabId);

    if (this.activeAgentChatId === tabId) {
      this.activeAgentChatId = null;
    }

    this.notifyTabsChanged();
    return true;
  }

  hideTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    tab.hide();
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
    }

    this.notifyTabsChanged();
    return true;
  }

  hideAgentChat(tabId: string): boolean {
    const chat = this.agentChatsMap.get(tabId);
    if (!chat) {
      return false;
    }

    chat.hide();
    if (this.activeAgentChatId === tabId) {
      this.activeAgentChatId = null;
    }

    this.notifyTabsChanged();
    return true;
  }

  syncVisibleTabs(
    visibleTabIds: string[],
    materialize: (tabId: string, url: string) => void,
    getUrl: (tabId: string) => string | undefined,
  ): void {
    const visibleSet = new Set(visibleTabIds);

    for (const tabId of Array.from(this.tabsMap.keys())) {
      if (!visibleSet.has(tabId)) {
        this.tabsMap.get(tabId)?.hide();
      }
    }

    for (const tabId of visibleTabIds) {
      if (!this.tabsMap.has(tabId)) {
        materialize(tabId, getUrl(tabId) ?? "about:blank");
      }
    }
  }

  syncVisibleAgentChats(visibleAgentChatIds: string[]): void {
    const visibleSet = new Set(visibleAgentChatIds);

    for (const tabId of Array.from(this.agentChatsMap.keys())) {
      if (!visibleSet.has(tabId)) {
        this.agentChatsMap.get(tabId)?.hide();
      }
    }

    for (const tabId of visibleAgentChatIds) {
      if (!this.agentChatsMap.has(tabId)) {
        this.materializeAgentChat(tabId);
      }
    }
  }

  switchActiveTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    this.hideContextDashboard();
    this.hideAllAgentChats();

    if (this.activeTabId && this.activeTabId !== tabId) {
      this.tabsMap.get(this.activeTabId)?.hide();
    }

    tab.show();
    this.activeTabId = tabId;
    this.activeAgentChatId = null;
    this._baseWindow.setTitle(tab.title || "Blueberry Browser");
    this.notifyTabsChanged();
    return true;
  }

  switchActiveAgentChat(tabId: string): boolean {
    const chat = this.agentChatsMap.get(tabId);
    if (!chat) {
      return false;
    }

    this.hideContextDashboard();

    if (this.activeTabId) {
      this.tabsMap.get(this.activeTabId)?.hide();
      this.activeTabId = null;
    }

    this.hideAllAgentChats(tabId);
    chat.show(this.getContentTop());
    this.activeAgentChatId = tabId;
    this._baseWindow.setTitle("Agent Chat");
    this.notifyTabsChanged();
    return true;
  }

  private hideAllAgentChats(exceptId?: string): void {
    for (const [id, chat] of this.agentChatsMap) {
      if (id !== exceptId) {
        chat.hide();
      }
    }
  }

  showContextDashboard(): void {
    if (this.contextDashboardVisible) {
      return;
    }

    if (this.activeTabId) {
      this.tabsMap.get(this.activeTabId)?.hide();
      this.activeTabId = null;
    }

    this.hideAllAgentChats();
    this.activeAgentChatId = null;

    this.contextDashboardVisible = true;
    this._contextDashboard.show(this.getContentTop());
    this._baseWindow.setTitle("Blueberry Browser");
    this.notifyTabsChanged();
  }

  hideContextDashboard(): void {
    if (!this.contextDashboardVisible) {
      return;
    }

    this.contextDashboardVisible = false;
    this._contextDashboard.hide();
  }

  isContextDashboardVisible(): boolean {
    return this.contextDashboardVisible;
  }

  clearActiveTab(): void {
    if (this.activeTabId) {
      this.tabsMap.get(this.activeTabId)?.hide();
      this.activeTabId = null;
      this.notifyTabsChanged();
    }
  }

  onTabsChanged(listener: () => void): () => void {
    this.tabsChangedListeners.add(listener);
    return () => this.tabsChangedListeners.delete(listener);
  }

  private notifyTabsChanged(): void {
    for (const listener of this.tabsChangedListeners) {
      listener();
    }
  }

  getTab(tabId: string): Tab | null {
    return this.tabsMap.get(tabId) || null;
  }

  getAgentChat(tabId: string): AgentChatView | null {
    return this.agentChatsMap.get(tabId) ?? null;
  }

  getActiveAgentChat(): AgentChatView | null {
    if (this.activeAgentChatId) {
      return this.agentChatsMap.get(this.activeAgentChatId) ?? null;
    }
    return null;
  }

  show(): void {
    this._baseWindow.show();
  }

  hide(): void {
    this._baseWindow.hide();
  }

  close(): void {
    this._baseWindow.close();
  }

  focus(): void {
    this._baseWindow.focus();
  }

  minimize(): void {
    this._baseWindow.minimize();
  }

  maximize(): void {
    this._baseWindow.maximize();
  }

  unmaximize(): void {
    this._baseWindow.unmaximize();
  }

  isMaximized(): boolean {
    return this._baseWindow.isMaximized();
  }

  setTitle(title: string): void {
    this._baseWindow.setTitle(title);
  }

  setBounds(bounds: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }): void {
    this._baseWindow.setBounds(bounds);
  }

  getBounds(): { x: number; y: number; width: number; height: number } {
    return this._baseWindow.getBounds();
  }

  private setContentBounds(view: Electron.View): void {
    const bounds = this._baseWindow.getBounds();
    const contentTop = this.getContentTop();
    view.setBounds({
      x: 0,
      y: contentTop,
      width: bounds.width,
      height: bounds.height - contentTop,
    });
  }

  private updateTabBounds(): void {
    this.tabsMap.forEach((tab) => this.setContentBounds(tab.view));
  }

  private updateAgentChatBounds(): void {
    const contentTop = this.getContentTop();
    for (const chat of this.agentChatsMap.values()) {
      chat.updateBounds(contentTop);
    }
  }

  updateAllBounds(): void {
    const contentTop = this.getContentTop();
    this._topBar.updateBounds();
    this.updateTabBounds();
    this._contextDashboard.updateBounds(contentTop);
    this.updateAgentChatBounds();
  }

  getContentTop(): number {
    return this._topBar.getHeight();
  }

  get contextDashboard(): ContextDashboard {
    return this._contextDashboard;
  }

  get topBar(): TopBar {
    return this._topBar;
  }

  get tabs(): Tab[] {
    return Array.from(this.tabsMap.values());
  }

  get baseWindow(): BaseWindow {
    return this._baseWindow;
  }
}
