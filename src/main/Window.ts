import { randomUUID } from "crypto";
import { BaseWindow, shell } from "electron";
import { Tab } from "./Tab";
import { TopBar } from "../topBar/mainTopBar";
import { SideBar } from "../sideBar/mainSideBar";
import { EventPanel, EVENT_PANEL_WIDTH } from "../eventPanel/mainEventPanel";

export type TabStateCallback = (
  tabId: string,
  title: string,
  url: string,
) => void;

export class Window {
  readonly id: string;
  private _baseWindow: BaseWindow;
  private tabsMap: Map<string, Tab> = new Map();
  private activeTabId: string | null = null;
  private _topBar: TopBar;
  private _sideBar: SideBar;
  private _eventPanel: EventPanel;
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
    this._eventPanel = new EventPanel(this._baseWindow);
    this._sideBar = new SideBar(this._baseWindow);

    this._sideBar.client.setWindow(this);

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

  get allTabs(): Tab[] {
    return Array.from(this.tabsMap.values());
  }

  get tabCount(): number {
    return this.tabsMap.size;
  }

  getMaterializedTabIds(): string[] {
    return Array.from(this.tabsMap.keys());
  }

  getTabRecordUrl(tabId: string): string | undefined {
    return this.tabsMap.get(tabId)?.url;
  }

  materializeTab(
    tabId: string,
    url: string,
    onStateChanged?: TabStateCallback,
    title?: string,
  ): Tab {
    const existing = this.tabsMap.get(tabId);
    if (existing) {
      return existing;
    }

    const callback: TabStateCallback = (id, title, changedUrl) => {
      onStateChanged?.(id, title, changedUrl);
    };

    const tab = new Tab(tabId, url, callback, title);

    tab.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: "deny" };
    });

    this._baseWindow.contentView.addChildView(tab.view);
    this.setTabBounds(tab);
    tab.hide();

    this.tabsMap.set(tabId, tab);
    if (onStateChanged) {
      this.tabStateCallbacks.set(tabId, onStateChanged);
    }

    this.notifyTabsChanged();
    return tab;
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

  syncVisibleTabs(
    visibleTabIds: string[],
    materialize: (tabId: string, url: string) => void,
    getUrl: (tabId: string) => string | undefined,
  ): void {
    const visibleSet = new Set(visibleTabIds);

    for (const tabId of Array.from(this.tabsMap.keys())) {
      if (!visibleSet.has(tabId)) {
        const tab = this.tabsMap.get(tabId);
        if (tab) {
          tab.hide();
        }
      }
    }

    for (const tabId of visibleTabIds) {
      if (!this.tabsMap.has(tabId)) {
        materialize(tabId, getUrl(tabId) ?? "https://www.google.com");
      }
    }
  }

  closeTab(tabId: string): boolean {
    return this.destroyTabView(tabId);
  }

  switchActiveTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    if (this.activeTabId && this.activeTabId !== tabId) {
      const currentTab = this.tabsMap.get(this.activeTabId);
      currentTab?.hide();
    }

    tab.show();
    this.activeTabId = tabId;
    this._baseWindow.setTitle(tab.title || "Blueberry Browser");
    this.notifyTabsChanged();
    return true;
  }

  clearActiveTab(): void {
    if (this.activeTabId) {
      const currentTab = this.tabsMap.get(this.activeTabId);
      currentTab?.hide();
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

  private setTabBounds(tab: Tab): void {
    const bounds = this._baseWindow.getBounds();
    const sidebarWidth = this._sideBar.getIsVisible() ? 400 : 0;
    const contentTop = this.getContentTop();
    tab.view.setBounds({
      x: EVENT_PANEL_WIDTH,
      y: contentTop,
      width: bounds.width - EVENT_PANEL_WIDTH - sidebarWidth,
      height: bounds.height - contentTop,
    });
  }

  private updateTabBounds(): void {
    this.tabsMap.forEach((tab) => this.setTabBounds(tab));
  }

  updateAllBounds(): void {
    const contentTop = this.getContentTop();
    this._topBar.updateBounds();
    this.updateTabBounds();
    this._eventPanel.updateBounds(contentTop);
    this._sideBar.updateBounds(contentTop);
  }

  getContentTop(): number {
    return this._topBar.getHeight();
  }

  get sidebar(): SideBar {
    return this._sideBar;
  }

  get eventPanel(): EventPanel {
    return this._eventPanel;
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
