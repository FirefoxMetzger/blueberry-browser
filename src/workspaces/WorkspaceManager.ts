import type {
  Event,
  WorkspaceEventPayloads,
  WorkspacePayloadType,
} from "../events/types";
import { eventDatabase } from "../events/database";
import {
  WORKSPACE_EVENTS_QUERY,
  LATEST_WORKSPACE_SWITCH_QUERY,
} from "../events/queries";
import type { Window } from "../main/Window";
import { applyEventRow, replayProjection } from "./WorkspaceProjection";
import { TabHistoryAggregator } from "./WorkspaceHistory";
import {
  createMoveId,
  createTabId,
  createWorkspaceId,
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_TOPIC,
  PENDING_TAB_URL,
  type GlobalWorkspaceProjection,
  type TabKind,
  type TabRecord,
  type TabSnapshot,
  type WorkspaceInfo,
  type WorkspaceSnapshot,
  type WorkspaceState,
  workspaceTopic,
} from "./types";
import {
  createWorkspaceContextDirs,
  deleteWorkspaceContextDirs,
  isValidWorkspaceDirName,
} from "./workspaceContextDirs";

const DOMAIN_METADATA = { source: "workspace-manager" as const };
const DOMAIN_METADATA_TYPE = "workspace-meta";

interface StoredEventRow {
  topic: string;
  payload_type: string;
  payload: string;
}

interface WorkspaceSwitchEventRow {
  payload: string;
}

type StateListener = () => void;

function truncateTitle(text: string, maxLength = 40): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

export function normalizeAddressBarInput(
  input: string,
  allowSearch: boolean,
): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      new URL(trimmed);
      return trimmed;
    } catch {
      return null;
    }
  }

  if (trimmed.includes(".") && !trimmed.includes(" ")) {
    return `https://${trimmed}`;
  }

  if (allowSearch) {
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  return null;
}

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

    const startupWorkspaceId = this.getStartupWorkspaceId();
    this.windowWorkspaceSelection.set(windowId, startupWorkspaceId);

    const workspace = this.projection.workspaces.get(startupWorkspaceId);
    if (!workspace || workspace.tabOrder.length === 0) {
      if (startupWorkspaceId === DEFAULT_WORKSPACE_ID) {
        this.createTab(windowId);
      } else {
        this.switchWorkspace(windowId, startupWorkspaceId);
      }
    } else {
      this.switchWorkspace(windowId, startupWorkspaceId);
    }
    return windowId;
  }

  private getStartupWorkspaceId(): string {
    const lastWorkspaceId = this.loadLastActiveWorkspaceIdFromHistory();
    if (
      lastWorkspaceId &&
      this.projection.workspaces.has(lastWorkspaceId)
    ) {
      return lastWorkspaceId;
    }
    return DEFAULT_WORKSPACE_ID;
  }

  private loadLastActiveWorkspaceIdFromHistory(): string | null {
    const [row] = eventDatabase.query<WorkspaceSwitchEventRow>(
      LATEST_WORKSPACE_SWITCH_QUERY,
    );
    if (!row) {
      return null;
    }

    try {
      const payload = JSON.parse(row.payload) as { workspaceId?: string };
      return typeof payload.workspaceId === "string" ? payload.workspaceId : null;
    } catch {
      return null;
    }
  }

  unregisterWindow(windowId: string): void {
    this.windows.delete(windowId);
    this.windowWorkspaceSelection.delete(windowId);
  }

  getSelectedWorkspaceId(windowId: string): string {
    return this.windowWorkspaceSelection.get(windowId) ?? DEFAULT_WORKSPACE_ID;
  }

  getActiveWorkspaceTopic(windowId: string): string {
    return this.getWorkspaceTopic(this.getSelectedWorkspaceId(windowId));
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
    const activeItemId = window?.activeWorkspaceItemId ?? null;

    const tabs = this.getTabsForWorkspace(activeWorkspaceId, windowId).map(
      (tab) => ({
        ...tab,
        isActive: tab.id === activeItemId,
      }),
    );

    return {
      workspaces: this.getWorkspaces(windowId),
      activeWorkspaceId,
      tabs,
      contextDashboardVisible: window?.isContextDashboardVisible() ?? false,
    };
  }

  private getWorkspaceState(workspaceId: string): WorkspaceState | undefined {
    return this.projection.workspaces.get(workspaceId);
  }

  private getWorkspaceTabIds(workspaceId: string): string[] {
    return this.getWorkspaceState(workspaceId)?.tabOrder ?? [];
  }

  getTabKind(workspaceId: string, tabId: string): TabKind {
    const record = this.getTabRecord(workspaceId, tabId);
    return record?.kind ?? "browser";
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
      const kind = record?.kind ?? "browser";
      return {
        id: tabId,
        title:
          materialized?.title ??
          record?.title ??
          (kind === "agent-chat" ? "Agent Chat" : "New Tab"),
        url: materialized?.url ?? record?.url ?? PENDING_TAB_URL,
        kind,
        isActive: false,
        workspaceId,
      };
    });
  }

  getWorkspaceTopic(workspaceId: string): string {
    const workspace = this.getWorkspaceState(workspaceId);
    return workspace?.topic ?? DEFAULT_WORKSPACE_TOPIC;
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
    if (window?.getTab(tabId) || window?.getAgentChat(tabId)) {
      return DEFAULT_WORKSPACE_ID;
    }

    return null;
  }

  createTab(windowId: string): TabSnapshot | null {
    const window = this.windows.get(windowId);
    if (!window) {
      return null;
    }

    const workspaceId = this.getSelectedWorkspaceId(windowId);
    const tabId = createTabId();
    const topic = this.getWorkspaceTopic(workspaceId);

    this.publishDomainEvent(topic, "tab-created", {
      tabId,
      url: PENDING_TAB_URL,
      title: "New Tab",
      kind: "pending",
    });

    window.materializeTab(
      tabId,
      PENDING_TAB_URL,
      (changedTabId, title, changedUrl) => {
        this.handleTabStateChanged(windowId, changedTabId, title, changedUrl);
      },
      "New Tab",
    );
    window.switchActiveTab(tabId);

    return {
      id: tabId,
      title: "New Tab",
      url: PENDING_TAB_URL,
      kind: "pending",
      isActive: true,
      workspaceId,
    };
  }

  submitAddressBar(
    windowId: string,
    tabId: string,
    input: string,
  ): boolean {
    const window = this.windows.get(windowId);
    if (!window) {
      return false;
    }

    const workspaceId = this.findTabWorkspace(tabId, windowId);
    if (!workspaceId) {
      return false;
    }

    const kind = this.getTabKind(workspaceId, tabId);
    const trimmed = input.trim();
    if (!trimmed) {
      return false;
    }

    if (kind === "pending") {
      const url = normalizeAddressBarInput(trimmed, false);
      if (url) {
        this.commitPendingTab(windowId, tabId, url);
      } else {
        this.convertTabToAgentChat(windowId, tabId, trimmed);
      }
      return true;
    }

    if (kind === "browser") {
      const url = normalizeAddressBarInput(trimmed, true);
      if (url) {
        this.handleNavigateTab(windowId, tabId, url);
      }
      return true;
    }

    return false;
  }

  private commitPendingTab(
    windowId: string,
    tabId: string,
    url: string,
  ): void {
    const workspaceId = this.findTabWorkspace(tabId, windowId);
    if (!workspaceId) {
      return;
    }

    const topic = this.getWorkspaceTopic(workspaceId);
    this.publishDomainEvent(topic, "tab-kind-changed", {
      tabId,
      kind: "browser",
      url,
    });

    const tab = this.windows.get(windowId)?.getTab(tabId);
    if (tab) {
      void tab.loadURL(url);
    }

    this.notifyStateChanged();
  }

  private convertTabToAgentChat(
    windowId: string,
    tabId: string,
    initialMessage: string,
  ): void {
    const window = this.windows.get(windowId);
    const workspaceId = this.findTabWorkspace(tabId, windowId);
    if (!window || !workspaceId) {
      return;
    }

    const title = truncateTitle(initialMessage);
    const topic = this.getWorkspaceTopic(workspaceId);

    window.destroyTabView(tabId);

    this.publishDomainEvent(topic, "tab-kind-changed", {
      tabId,
      kind: "agent-chat",
      title,
      url: "",
    });

    const chat = window.materializeAgentChat(tabId);
    window.switchActiveAgentChat(tabId);

    this.publishDomainEvent(topic, "tab-activated", { tabId });

    void chat.client.sendChatMessage({
      message: initialMessage,
      messageId: Date.now().toString(),
    });

    this.notifyStateChanged();
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

    const kind = this.getTabKind(workspaceId, tabId);
    const topic = this.getWorkspaceTopic(workspaceId);
    this.publishDomainEvent(topic, "tab-closed", { tabId });

    if (kind === "agent-chat") {
      window.destroyAgentChatView(tabId);
    } else {
      window.destroyTabView(tabId);
    }

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

    const kind = this.getTabKind(workspaceId, tabId);
    const record = this.getTabRecord(workspaceId, tabId);

    if (kind === "agent-chat") {
      if (!window.getAgentChat(tabId)) {
        window.materializeAgentChat(tabId);
      }
      window.switchActiveAgentChat(tabId);
    } else {
      if (!window.getTab(tabId)) {
        window.materializeTab(
          tabId,
          record?.url ?? PENDING_TAB_URL,
          (changedTabId, title, url) => {
            this.handleTabStateChanged(windowId, changedTabId, title, url);
          },
          record?.title,
          record?.history,
        );
      }
      window.switchActiveTab(tabId);
    }

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

  showContextDashboard(windowId: string): boolean {
    const window = this.windows.get(windowId);
    if (!window) {
      return false;
    }

    window.showContextDashboard();
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
    const browserTabIds = tabIds.filter(
      (tabId) => this.getTabKind(workspaceId, tabId) !== "agent-chat",
    );
    const agentChatIds = tabIds.filter(
      (tabId) => this.getTabKind(workspaceId, tabId) === "agent-chat",
    );

    window.syncVisibleTabs(
      browserTabIds,
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

    window.syncVisibleAgentChats(agentChatIds);

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

    if (!isValidWorkspaceDirName(trimmed)) {
      return null;
    }

    const workspaceId = createWorkspaceId();
    const topic = workspaceTopic(trimmed);

    createWorkspaceContextDirs(trimmed);

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

    const workspaceName = workspace.name;

    this.publishDomainEvent(workspace.topic, "workspace-removed", {
      workspaceId,
    });

    for (const [id, window] of this.windows) {
      if (this.getSelectedWorkspaceId(id) === workspaceId) {
        this.windowWorkspaceSelection.set(id, DEFAULT_WORKSPACE_ID);
        this.switchWorkspace(id, DEFAULT_WORKSPACE_ID);
      }

      for (const tabId of workspace.tabOrder) {
        const kind = workspace.tabs.get(tabId)?.kind ?? "browser";
        if (kind === "agent-chat") {
          window.destroyAgentChatView(tabId);
        } else {
          window.destroyTabView(tabId);
        }
      }
    }

    deleteWorkspaceContextDirs(workspaceName);

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
    const kind = record?.kind ?? "browser";
    const url = tab?.url ?? record?.url ?? PENDING_TAB_URL;
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
          kind,
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
          kind,
        },
      },
    ]);

    if (this.getSelectedWorkspaceId(windowId) === sourceWorkspaceId) {
      if (kind === "agent-chat") {
        window.hideAgentChat(tabId);
      } else {
        window.hideTab(tabId);
      }
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
        !otherWindow.getTab(tabId) &&
        !otherWindow.getAgentChat(tabId)
      ) {
        if (kind === "agent-chat") {
          otherWindow.materializeAgentChat(tabId);
        } else {
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

    const kind = this.getTabKind(workspaceId, tabId);
    if (kind !== "browser") {
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
