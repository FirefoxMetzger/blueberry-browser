import type {
  Event,
  WorkspaceEventPayloads,
  WorkspacePayloadType,
} from "../events/types";
import { eventDatabase } from "../events/database";
import type { Window } from "../main/Window";
import { applyEventRow, replayProjection } from "./WorkspaceProjection";
import { TabHistoryAggregator } from "./WorkspaceHistory";
import {
  createMoveId,
  createTabId,
  createWorkspaceId,
  DEFAULT_WORKSPACE_ID,
  type GlobalWorkspaceProjection,
  type TabRecord,
  type TabSnapshot,
  type WorkspaceInfo,
  type WorkspaceSnapshot,
  type WorkspaceState,
  workspaceTopic,
} from "./types";

const WORKSPACE_EVENTS_QUERY = `
  SELECT topic, payload_type, payload
  FROM events
  WHERE topic = 'default'
     OR metadata_type = 'workspace-meta'
  ORDER BY id ASC
`;

const DOMAIN_METADATA = { source: "workspace-manager" as const };
const DOMAIN_METADATA_TYPE = "workspace-meta";

interface StoredEventRow {
  topic: string;
  payload_type: string;
  payload: string;
}

type StateListener = () => void;

export class WorkspaceManager {
  private projection: GlobalWorkspaceProjection;
  private historyAggregator: TabHistoryAggregator;
  private windows = new Map<string, Window>();
  private windowWorkspaceSelection = new Map<string, string>();
  private stateListeners = new Set<StateListener>();
  private broadcastEvent: (event: Event) => void;

  constructor(broadcastEvent: (event: Event) => void) {
    this.broadcastEvent = broadcastEvent;
    const restored = this.loadProjectionFromHistory();
    this.projection = restored.projection;
    this.historyAggregator = restored.historyAggregator;
  }

  private loadProjectionFromHistory(): {
    projection: GlobalWorkspaceProjection;
    historyAggregator: TabHistoryAggregator;
  } {
    const rows = eventDatabase.query<StoredEventRow>(WORKSPACE_EVENTS_QUERY);
    const parsedRows = rows.map((row) => ({
      topic: row.topic,
      payload_type: row.payload_type,
      payload: JSON.parse(row.payload) as unknown,
    }));

    const projection = replayProjection(parsedRows);
    const historyAggregator = new TabHistoryAggregator(parsedRows);
    historyAggregator.hydrateProjection(projection);

    return { projection, historyAggregator };
  }

  onStateChanged(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private notifyStateChanged(): void {
    for (const listener of this.stateListeners) {
      listener();
    }
  }

  private publishDomainEvent<K extends WorkspacePayloadType>(
    topic: string,
    payloadType: K,
    payload: WorkspaceEventPayloads[K],
  ): Event<WorkspaceEventPayloads[K], typeof DOMAIN_METADATA> {
    const event = eventDatabase.publish(
      topic,
      1,
      payload,
      payloadType,
      DOMAIN_METADATA,
      DOMAIN_METADATA_TYPE,
    );
    applyEventRow(this.projection, event);
    this.historyAggregator.apply(event);
    this.historyAggregator.hydrateProjection(this.projection);
    this.broadcastEvent(event);
    return event;
  }

  private publishDomainEvents<K extends WorkspacePayloadType>(
    entries: {
      topic: string;
      payloadType: K;
      payload: WorkspaceEventPayloads[K];
    }[],
  ): Event<WorkspaceEventPayloads[K], typeof DOMAIN_METADATA>[] {
    const events = eventDatabase.publishMany(
      entries.map((entry) => ({
        topic: entry.topic,
        version: 1,
        payload: entry.payload,
        payloadType: entry.payloadType,
        metadata: DOMAIN_METADATA,
        metadataType: DOMAIN_METADATA_TYPE,
      })),
    );

    for (const event of events) {
      applyEventRow(this.projection, event);
      this.historyAggregator.apply(event);
      this.broadcastEvent(event);
    }

    this.historyAggregator.hydrateProjection(this.projection);

    return events;
  }

  registerWindow(window: Window): string {
    const windowId = window.id;
    this.windows.set(windowId, window);
    this.windowWorkspaceSelection.set(windowId, DEFAULT_WORKSPACE_ID);

    const defaultWorkspace =
      this.projection.workspaces.get(DEFAULT_WORKSPACE_ID);
    if (!defaultWorkspace || defaultWorkspace.tabOrder.length === 0) {
      this.createTab(windowId, "https://www.google.com");
    } else {
      this.switchWorkspace(windowId, DEFAULT_WORKSPACE_ID);
    }
    return windowId;
  }

  unregisterWindow(windowId: string): void {
    this.windows.delete(windowId);
    this.windowWorkspaceSelection.delete(windowId);
  }

  getSelectedWorkspaceId(windowId: string): string {
    return this.windowWorkspaceSelection.get(windowId) ?? DEFAULT_WORKSPACE_ID;
  }

  getWorkspaces(windowId: string): WorkspaceInfo[] {
    const activeWorkspaceId = this.getSelectedWorkspaceId(windowId);

    return Array.from(this.projection.workspaces.values())
      .sort((a, b) => {
        if (a.id === DEFAULT_WORKSPACE_ID) return -1;
        if (b.id === DEFAULT_WORKSPACE_ID) return 1;
        return a.name.localeCompare(b.name);
      })
      .map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        topic: workspace.topic,
        tabCount: workspace.tabOrder.length,
        isDefault: workspace.id === DEFAULT_WORKSPACE_ID,
        isActive: workspace.id === activeWorkspaceId,
      }));
  }

  getSnapshot(windowId: string): WorkspaceSnapshot {
    const activeWorkspaceId = this.getSelectedWorkspaceId(windowId);
    const window = this.windows.get(windowId);
    const activeTabId = window?.activeTab?.id ?? null;

    const tabs = this.getTabsForWorkspace(activeWorkspaceId, windowId).map(
      (tab) => ({
        ...tab,
        isActive: tab.id === activeTabId,
      }),
    );

    return {
      workspaces: this.getWorkspaces(windowId),
      activeWorkspaceId,
      tabs,
    };
  }

  private getWorkspaceState(workspaceId: string): WorkspaceState | undefined {
    return this.projection.workspaces.get(workspaceId);
  }

  private getWorkspaceTabIds(workspaceId: string): string[] {
    return this.getWorkspaceState(workspaceId)?.tabOrder ?? [];
  }

  private getTabsForWorkspace(
    workspaceId: string,
    windowId: string,
  ): TabSnapshot[] {
    const window = this.windows.get(windowId);
    const workspace = this.getWorkspaceState(workspaceId);
    if (!window || !workspace) {
      return [];
    }

    return workspace.tabOrder.map((tabId) => {
      const materialized = window.getTab(tabId);
      const record = workspace.tabs.get(tabId);
      return {
        id: tabId,
        title: materialized?.title ?? record?.title ?? "New Tab",
        url: materialized?.url ?? record?.url ?? "https://www.google.com",
        isActive: false,
        workspaceId,
      };
    });
  }

  getWorkspaceTopic(workspaceId: string): string {
    const workspace = this.getWorkspaceState(workspaceId);
    return workspace?.topic ?? workspaceTopic(workspaceId);
  }

  getTabWorkspaceTopic(windowId: string, tabId: string): string | null {
    const workspaceId = this.findTabWorkspace(tabId, windowId);
    return workspaceId ? this.getWorkspaceTopic(workspaceId) : null;
  }

  private findTabWorkspace(tabId: string, windowId: string): string | null {
    for (const [workspaceId, workspace] of this.projection.workspaces) {
      if (workspace.tabs.has(tabId)) {
        return workspaceId;
      }
    }

    const window = this.windows.get(windowId);
    if (window?.getTab(tabId)) {
      return DEFAULT_WORKSPACE_ID;
    }

    return null;
  }

  createTab(
    windowId: string,
    url = "https://www.google.com",
  ): TabSnapshot | null {
    const window = this.windows.get(windowId);
    if (!window) {
      return null;
    }

    const workspaceId = this.getSelectedWorkspaceId(windowId);
    const tabId = createTabId();
    const topic = this.getWorkspaceTopic(workspaceId);

    this.publishDomainEvent(topic, "tab-created", {
      tabId,
      url,
      title: "New Tab",
    });

    window.materializeTab(tabId, url, (changedTabId, title, changedUrl) => {
      this.handleTabStateChanged(windowId, changedTabId, title, changedUrl);
    });
    window.switchActiveTab(tabId);

    return {
      id: tabId,
      title: "New Tab",
      url,
      isActive: true,
      workspaceId,
    };
  }

  closeTab(windowId: string, tabId: string): boolean {
    const window = this.windows.get(windowId);
    if (!window) {
      return false;
    }

    const workspaceId = this.findTabWorkspace(tabId, windowId);
    if (!workspaceId) {
      return false;
    }

    const topic = this.getWorkspaceTopic(workspaceId);
    this.publishDomainEvent(topic, "tab-closed", { tabId });

    window.destroyTabView(tabId);

    if (workspaceId === this.getSelectedWorkspaceId(windowId)) {
      const remaining = this.getTabsForWorkspace(workspaceId, windowId);
      if (remaining.length > 0) {
        this.switchTab(windowId, remaining[0].id);
      } else if (workspaceId === DEFAULT_WORKSPACE_ID) {
        this.createTab(windowId);
      } else {
        window.clearActiveTab();
      }
    }

    this.notifyStateChanged();
    return true;
  }

  switchTab(windowId: string, tabId: string): boolean {
    const window = this.windows.get(windowId);
    if (!window) {
      return false;
    }

    const workspaceId = this.getSelectedWorkspaceId(windowId);
    const tabIds = this.getWorkspaceTabIds(workspaceId);
    if (!tabIds.includes(tabId)) {
      return false;
    }

    if (!window.getTab(tabId)) {
      const record = this.getTabRecord(workspaceId, tabId);
      window.materializeTab(
        tabId,
        record?.url ?? "https://www.google.com",
        (changedTabId, title, url) => {
          this.handleTabStateChanged(windowId, changedTabId, title, url);
        },
        record?.title,
        record?.history,
      );
    }

    window.switchActiveTab(tabId);

    this.publishDomainEvent(
      this.getWorkspaceTopic(workspaceId),
      "tab-activated",
      {
        tabId,
      },
    );

    this.notifyStateChanged();
    return true;
  }

  switchWorkspace(windowId: string, workspaceId: string): boolean {
    if (!this.projection.workspaces.has(workspaceId)) {
      return false;
    }

    const window = this.windows.get(windowId);
    if (!window) {
      return false;
    }

    const topic = this.getWorkspaceTopic(workspaceId);
    this.publishDomainEvent(topic, "workspace-switched", {
      windowId,
      workspaceId,
    });

    this.windowWorkspaceSelection.set(windowId, workspaceId);

    const tabIds = this.getWorkspaceTabIds(workspaceId);
    window.syncVisibleTabs(
      tabIds,
      (tabId, url) => {
        const record = this.getTabRecord(workspaceId, tabId);
        window.materializeTab(
          tabId,
          url,
          (changedTabId, title, changedUrl) => {
            this.handleTabStateChanged(
              windowId,
              changedTabId,
              title,
              changedUrl,
            );
          },
          record?.title,
          record?.history,
        );
      },
      (tabId) =>
        window.getTabRecordUrl(tabId) ??
        this.getTabRecord(workspaceId, tabId)?.url,
    );

    const workspace = this.getWorkspaceState(workspaceId);
    const targetTabId =
      workspace?.lastActiveTabId && tabIds.includes(workspace.lastActiveTabId)
        ? workspace.lastActiveTabId
        : (tabIds[0] ?? null);

    if (targetTabId) {
      this.switchTab(windowId, targetTabId);
    } else if (workspaceId === DEFAULT_WORKSPACE_ID) {
      this.createTab(windowId);
    } else {
      window.clearActiveTab();
      this.notifyStateChanged();
    }

    return true;
  }

  createWorkspace(_windowId: string, name: string): WorkspaceInfo | null {
    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }

    const hasDuplicateName = Array.from(
      this.projection.workspaces.values(),
    ).some((workspace) => workspace.name === trimmed);
    if (hasDuplicateName) {
      return null;
    }

    const workspaceId = createWorkspaceId();
    const topic = workspaceTopic(trimmed);

    this.publishDomainEvent(topic, "workspace-created", {
      workspaceId,
      name: trimmed,
    });

    this.notifyStateChanged();
    return {
      id: workspaceId,
      name: trimmed,
      topic,
      tabCount: 0,
      isDefault: false,
    };
  }

  removeWorkspace(_windowId: string, workspaceId: string): boolean {
    if (workspaceId === DEFAULT_WORKSPACE_ID) {
      return false;
    }

    const workspace = this.projection.workspaces.get(workspaceId);
    if (!workspace) {
      return false;
    }

    this.publishDomainEvent(workspace.topic, "workspace-removed", {
      workspaceId,
    });

    for (const [id, window] of this.windows) {
      if (this.getSelectedWorkspaceId(id) === workspaceId) {
        this.windowWorkspaceSelection.set(id, DEFAULT_WORKSPACE_ID);
        this.switchWorkspace(id, DEFAULT_WORKSPACE_ID);
      }

      for (const tabId of workspace.tabOrder) {
        window.destroyTabView(tabId);
      }
    }

    this.notifyStateChanged();
    return true;
  }

  moveTabToWorkspace(
    windowId: string,
    tabId: string,
    targetWorkspaceId: string,
  ): boolean {
    if (targetWorkspaceId === DEFAULT_WORKSPACE_ID) {
      return false;
    }

    const sourceWorkspaceId = this.findTabWorkspace(tabId, windowId);
    if (!sourceWorkspaceId || sourceWorkspaceId === targetWorkspaceId) {
      return false;
    }

    const targetWorkspace = this.projection.workspaces.get(targetWorkspaceId);
    if (!targetWorkspace) {
      return false;
    }

    const window = this.windows.get(windowId);
    if (!window) {
      return false;
    }

    const tab = window.getTab(tabId);
    const record = this.getTabRecord(sourceWorkspaceId, tabId);
    const url = tab?.url ?? record?.url ?? "https://www.google.com";
    const title = tab?.title ?? record?.title ?? "New Tab";
    const history = record?.history;
    const moveId = createMoveId();

    const sourceTopic = this.getWorkspaceTopic(sourceWorkspaceId);
    const targetTopic = this.getWorkspaceTopic(targetWorkspaceId);

    this.publishDomainEvents([
      {
        topic: sourceTopic,
        payloadType: "tab-moved",
        payload: {
          moveId,
          tabId,
          direction: "out",
          fromWorkspaceId: sourceWorkspaceId,
          toWorkspaceId: targetWorkspaceId,
          url,
          title,
        },
      },
      {
        topic: targetTopic,
        payloadType: "tab-moved",
        payload: {
          moveId,
          tabId,
          direction: "in",
          fromWorkspaceId: sourceWorkspaceId,
          toWorkspaceId: targetWorkspaceId,
          url,
          title,
        },
      },
    ]);

    if (this.getSelectedWorkspaceId(windowId) === sourceWorkspaceId) {
      window.hideTab(tabId);
      const remaining = this.getTabsForWorkspace(sourceWorkspaceId, windowId);
      if (remaining.length > 0) {
        this.switchTab(windowId, remaining[0].id);
      } else if (sourceWorkspaceId === DEFAULT_WORKSPACE_ID) {
        this.createTab(windowId);
      } else {
        window.clearActiveTab();
      }
    }

    for (const [id, otherWindow] of this.windows) {
      if (
        id !== windowId &&
        this.getSelectedWorkspaceId(id) === targetWorkspaceId &&
        !otherWindow.getTab(tabId)
      ) {
        otherWindow.materializeTab(
          tabId,
          url,
          (changedTabId, changedTitle, changedUrl) => {
            this.handleTabStateChanged(
              id,
              changedTabId,
              changedTitle,
              changedUrl,
            );
          },
          title,
          history,
        );
      }
    }

    this.notifyStateChanged();
    return true;
  }

  private getTabRecord(
    workspaceId: string,
    tabId: string,
  ): TabRecord | null | undefined {
    return this.projection.workspaces.get(workspaceId)?.tabs.get(tabId) ?? null;
  }

  handleTabStateChanged(
    windowId: string,
    tabId: string,
    title: string,
    url: string,
  ): void {
    const workspaceId = this.findTabWorkspace(tabId, windowId);
    if (!workspaceId) {
      this.notifyStateChanged();
      return;
    }

    const topic = this.getWorkspaceTopic(workspaceId);
    const record = this.getTabRecord(workspaceId, tabId);

    if (record && record.url !== url) {
      this.publishDomainEvent(topic, "tab-url-changed", { tabId, url });
    }

    if (record && record.title !== title) {
      this.publishDomainEvent(topic, "tab-title-changed", { tabId, title });
    }

    for (const [id, window] of this.windows) {
      if (id === windowId) {
        continue;
      }
      const otherTab = window.getTab(tabId);
      if (otherTab && otherTab.url !== url) {
        void otherTab.loadURL(url);
      }
    }

    this.notifyStateChanged();
  }

  handleNavigateTab(windowId: string, tabId: string, url: string): void {
    const window = this.windows.get(windowId);
    const tab = window?.getTab(tabId);
    if (!tab) {
      return;
    }

    const workspaceId = this.findTabWorkspace(tabId, windowId);
    if (!workspaceId) {
      this.notifyStateChanged();
      return;
    }

    const record = this.getTabRecord(workspaceId, tabId);
    if (record && record.url !== url) {
      this.publishDomainEvent(
        this.getWorkspaceTopic(workspaceId),
        "tab-url-changed",
        {
          tabId,
          url,
        },
      );
    }

    void tab.loadURL(url);

    for (const [id, otherWindow] of this.windows) {
      if (id === windowId) {
        continue;
      }
      const otherTab = otherWindow.getTab(tabId);
      if (otherTab) {
        void otherTab.loadURL(url);
      }
    }

    this.notifyStateChanged();
  }
}
