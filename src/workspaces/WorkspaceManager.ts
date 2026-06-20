import type {
  Event,
  WorkspaceEventPayloads,
  WorkspacePayloadType,
} from "../events/types";
import { app } from "electron";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { eventDatabase } from "../events/database";
import {
  WORKSPACE_EVENTS_QUERY,
  LATEST_WORKSPACE_SWITCH_QUERY,
} from "../events/queries";
import type { Window } from "../main/Window";
import type { Tab } from "../tabBrowser/Tab";
import {
  createMoveId,
  createTabId,
  createWorkspaceId,
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_TOPIC,
  isBlankTabUrl,
  PENDING_TAB_URL,
  type GlobalWorkspaceProjection,
  type TabKind,
  type TabHistorySnapshot,
  type TabRecord,
  type TabSnapshot,
  type WorkspaceInfo,
  type WorkspaceSnapshot,
  type WorkspaceState,
  workspaceTopic,
} from "./types";

const DOMAIN_METADATA = { source: "workspace-manager" as const };
const DOMAIN_METADATA_TYPE = "workspace-meta";
const WORKSPACE_CONTEXT_SUBDIRS = ["rules", "skills"] as const;

interface StoredEventRow {
  topic: string;
  payload_type: string;
  payload: string;
}

interface WorkspaceSwitchEventRow {
  payload: string;
}

type StateListener = () => void;

function isValidWorkspaceDirName(name: string): boolean {
  if (!name || name === "." || name === "..") {
    return false;
  }

  return !name.includes("/") && !name.includes("\\") && !name.includes("\0");
}

function createWorkspaceContextDirs(workspaceName: string): void {
  const workspaceDir = join(app.getPath("userData"), "workspaces", workspaceName);

  for (const subdir of WORKSPACE_CONTEXT_SUBDIRS) {
    mkdirSync(join(workspaceDir, subdir), { recursive: true });
  }
}

function deleteWorkspaceContextDirs(workspaceName: string): void {
  const workspaceDir = join(app.getPath("userData"), "workspaces", workspaceName);

  if (existsSync(workspaceDir)) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}

function normalizeAddressBarInput(
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

function createEmptyWorkspaceState(
  workspaceId: string,
  name: string,
  topic = workspaceTopic(name),
): WorkspaceState {
  return {
    id: workspaceId,
    name,
    topic,
    tabOrder: [],
    tabs: new Map(),
    lastActiveTabId: null,
  };
}

function createEmptyProjection(): GlobalWorkspaceProjection {
  const workspaces = new Map<string, WorkspaceState>();
  workspaces.set(
    DEFAULT_WORKSPACE_ID,
    createEmptyWorkspaceState(
      DEFAULT_WORKSPACE_ID,
      "Default",
      DEFAULT_WORKSPACE_TOPIC,
    ),
  );
  return { workspaces };
}

function addTabToWorkspace(
  state: WorkspaceState,
  tabId: string,
  url: string,
  title: string,
  kind: TabKind = "browser",
): void {
  if (!state.tabOrder.includes(tabId)) {
    state.tabOrder.push(tabId);
  }
  state.tabs.set(tabId, {
    id: tabId,
    title,
    url,
    kind,
  });
}

function removeTabFromWorkspace(state: WorkspaceState, tabId: string): void {
  state.tabOrder = state.tabOrder.filter((id) => id !== tabId);
  state.tabs.delete(tabId);
  if (state.lastActiveTabId === tabId) {
    state.lastActiveTabId =
      state.tabOrder.length > 0
        ? state.tabOrder[state.tabOrder.length - 1]
        : null;
  }
}

function applyEventRow(
  projection: GlobalWorkspaceProjection,
  row: Pick<Event, "topic" | "payload_type" | "payload">,
): void {
  const { topic, payload_type: payloadType, payload } = row;

  if (payloadType === "workspace-created") {
    const { workspaceId, name } =
      payload as WorkspaceEventPayloads["workspace-created"];
    if (!projection.workspaces.has(workspaceId)) {
      projection.workspaces.set(
        workspaceId,
        createEmptyWorkspaceState(workspaceId, name),
      );
    }
    return;
  }

  if (payloadType === "workspace-removed") {
    const { workspaceId } =
      payload as WorkspaceEventPayloads["workspace-removed"];
    if (workspaceId !== DEFAULT_WORKSPACE_ID) {
      projection.workspaces.delete(workspaceId);
    }
    return;
  }

  if (payloadType === "workspace-switched") {
    return;
  }

  if (!topic) {
    return;
  }

  let workspace: WorkspaceState | undefined;
  for (const candidate of projection.workspaces.values()) {
    if (candidate.topic === topic) {
      workspace = candidate;
      break;
    }
  }

  if (workspace) {
    applyTabEventToWorkspace(workspace, payloadType, payload);
  }
}

function applyTabEventToWorkspace(
  state: WorkspaceState,
  payloadType: string,
  payload: unknown,
): void {
  switch (payloadType) {
    case "tab-created": {
      const { tabId, url, title, kind } =
        payload as WorkspaceEventPayloads["tab-created"];
      addTabToWorkspace(
        state,
        tabId,
        url,
        title ?? "New Tab",
        kind ?? "browser",
      );
      state.lastActiveTabId = tabId;
      break;
    }
    case "tab-kind-changed": {
      const { tabId, kind, url, title } =
        payload as WorkspaceEventPayloads["tab-kind-changed"];
      const tab = state.tabs.get(tabId);
      if (tab) {
        tab.kind = kind;
        if (url !== undefined) {
          tab.url = url;
        }
        if (title !== undefined) {
          tab.title = title;
        }
      }
      break;
    }
    case "tab-closed": {
      const { tabId } = payload as WorkspaceEventPayloads["tab-closed"];
      removeTabFromWorkspace(state, tabId);
      break;
    }
    case "tab-url-changed": {
      const { tabId, url } =
        payload as WorkspaceEventPayloads["tab-url-changed"];
      const tab = state.tabs.get(tabId);
      if (tab) {
        tab.url = url;
      }
      break;
    }
    case "tab-title-changed": {
      const { tabId, title } =
        payload as WorkspaceEventPayloads["tab-title-changed"];
      const tab = state.tabs.get(tabId);
      if (tab) {
        tab.title = title;
      }
      break;
    }
    case "tab-activated": {
      const { tabId } = payload as WorkspaceEventPayloads["tab-activated"];
      if (state.tabs.has(tabId)) {
        state.lastActiveTabId = tabId;
      }
      break;
    }
    case "tab-moved": {
      const move = payload as WorkspaceEventPayloads["tab-moved"];
      if (move.direction === "out") {
        removeTabFromWorkspace(state, move.tabId);
      } else {
        addTabToWorkspace(
          state,
          move.tabId,
          move.url,
          move.title,
          move.kind ?? "browser",
        );
        state.lastActiveTabId = move.tabId;
      }
      break;
    }
    default:
      break;
  }
}

function replayProjection(
  rows: Pick<Event, "topic" | "payload_type" | "payload">[],
): GlobalWorkspaceProjection {
  const projection = createEmptyProjection();
  for (const row of rows) {
    applyEventRow(projection, row);
  }
  return projection;
}

type HistoryEventRow = Pick<Event, "payload_type" | "payload">;

function createNavigationEntry(
  url: string,
  title?: string,
): Electron.NavigationEntry {
  return {
    url,
    title: title ?? url,
  };
}

class TabHistoryAggregator {
  private histories = new Map<string, TabHistorySnapshot>();

  constructor(rows: HistoryEventRow[] = []) {
    for (const row of rows) {
      this.apply(row);
    }
  }

  apply(row: HistoryEventRow): void {
    switch (row.payload_type) {
      case "tab-created": {
        const { tabId, url, title } =
          row.payload as WorkspaceEventPayloads["tab-created"];
        this.histories.set(tabId, {
          entries: [createNavigationEntry(url, title ?? "New Tab")],
          index: 0,
        });
        break;
      }
      case "tab-closed": {
        const { tabId } = row.payload as WorkspaceEventPayloads["tab-closed"];
        this.histories.delete(tabId);
        break;
      }
      case "tab-url-changed": {
        const { tabId, url } =
          row.payload as WorkspaceEventPayloads["tab-url-changed"];
        this.applyUrlChange(tabId, url);
        break;
      }
      case "tab-title-changed": {
        const { tabId, title } =
          row.payload as WorkspaceEventPayloads["tab-title-changed"];
        this.applyTitleChange(tabId, title);
        break;
      }
      default:
        break;
    }
  }

  getHistory(tabId: string): TabHistorySnapshot | undefined {
    const history = this.histories.get(tabId);
    if (!history || history.entries.length === 0) {
      return undefined;
    }

    return {
      entries: history.entries.map((entry) => ({ ...entry })),
      index: history.index,
    };
  }

  hydrateProjection(projection: GlobalWorkspaceProjection): void {
    for (const workspace of projection.workspaces.values()) {
      for (const [tabId, tab] of workspace.tabs) {
        tab.history = this.getHistory(tabId);
      }
    }
  }

  private applyUrlChange(tabId: string, url: string): void {
    const history = this.ensureHistory(tabId, url);
    const current = history.entries[history.index];

    if (current?.url === url) {
      return;
    }

    history.entries = history.entries.slice(0, history.index + 1);
    history.entries.push(createNavigationEntry(url));
    history.index = history.entries.length - 1;
  }

  private applyTitleChange(tabId: string, title: string): void {
    const history = this.histories.get(tabId);
    if (!history) {
      return;
    }

    const current = history.entries[history.index];
    if (current) {
      current.title = title;
    }
  }

  private ensureHistory(tabId: string, url: string): TabHistorySnapshot {
    let history = this.histories.get(tabId);
    if (!history) {
      history = {
        entries: [createNavigationEntry(url)],
        index: 0,
      };
      this.histories.set(tabId, history);
    }
    return history;
  }
}

export class WorkspaceManager {
  private projection: GlobalWorkspaceProjection;
  private historyAggregator: TabHistoryAggregator;
  private window: Window | null = null;
  private selectedWorkspaceId = DEFAULT_WORKSPACE_ID;
  private stateListeners = new Set<StateListener>();
  private broadcastEvent: (event: Event) => void;

  constructor(broadcastEvent: (event: Event) => void) {
    this.broadcastEvent = broadcastEvent;

    const rows = eventDatabase.query<StoredEventRow>(WORKSPACE_EVENTS_QUERY);
    const parsedRows = rows.map((row) => ({
      topic: row.topic,
      payload_type: row.payload_type,
      payload: JSON.parse(row.payload) as unknown,
    }));

    this.projection = replayProjection(parsedRows);
    this.historyAggregator = new TabHistoryAggregator(parsedRows);
    this.historyAggregator.hydrateProjection(this.projection);
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

  private focusAddressBar(): void {
    const window = this.window;
    if (!window) {
      return;
    }

    const topBarContents = window.topBar.view.webContents;
    if (topBarContents.isDestroyed()) {
      return;
    }

    topBarContents.focus();
    if (!topBarContents.isLoadingMainFrame()) {
      topBarContents.send("focus-address-bar");
      return;
    }

    topBarContents.once("did-finish-load", () => {
      if (topBarContents.isDestroyed()) {
        return;
      }
      topBarContents.send("focus-address-bar");
    });
  }

  private publishDomainEvent<K extends WorkspacePayloadType>(
    topic: string,
    payloadType: K,
    payload: WorkspaceEventPayloads[K],
  ): void {
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

  registerWindow(window: Window): void {
    this.window = window;

    let startupWorkspaceId = DEFAULT_WORKSPACE_ID;
    const [row] = eventDatabase.query<WorkspaceSwitchEventRow>(
      LATEST_WORKSPACE_SWITCH_QUERY,
    );
    if (row) {
      try {
        const payload = JSON.parse(row.payload) as { workspaceId?: string };
        if (
          typeof payload.workspaceId === "string" &&
          this.projection.workspaces.has(payload.workspaceId)
        ) {
          startupWorkspaceId = payload.workspaceId;
        }
      } catch {
        // ignore malformed payload
      }
    }

    this.selectedWorkspaceId = startupWorkspaceId;
    this.switchWorkspace(window.id, startupWorkspaceId);
  }

  unregisterWindow(_windowId: string): void {
    this.window = null;
  }

  getSelectedWorkspaceId(_windowId: string): string {
    return this.selectedWorkspaceId;
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
    const window = this.window;
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

  private getTabKind(workspaceId: string, tabId: string): TabKind {
    const record = this.getTabRecord(workspaceId, tabId);
    return record?.kind ?? "browser";
  }

  private getTabsForWorkspace(
    workspaceId: string,
    _windowId: string,
  ): TabSnapshot[] {
    const window = this.window;
    const workspace = this.getWorkspaceState(workspaceId);
    if (!window || !workspace) {
      return [];
    }

    return workspace.tabOrder.map((tabId) => {
      const materialized = window.getTab(tabId);
      const record = workspace.tabs.get(tabId);
      const kind = record?.kind ?? "browser";
      const materializedUrl = materialized?.url;
      const recordUrl = record?.url;
      const url = !isBlankTabUrl(materializedUrl)
        ? materializedUrl!
        : !isBlankTabUrl(recordUrl)
          ? recordUrl!
          : (materializedUrl ?? recordUrl ?? PENDING_TAB_URL);
      return {
        id: tabId,
        title:
          materialized?.title ??
          record?.title ??
          (kind === "agent-chat" ? "Agent Chat" : "New Tab"),
        url,
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

  getWorkspaceName(workspaceId: string): string {
    return this.getWorkspaceState(workspaceId)?.name ?? "Default";
  }

  getTabWorkspaceTopic(windowId: string, tabId: string): string | null {
    const workspaceId = this.findTabWorkspace(tabId, windowId);
    return workspaceId ? this.getWorkspaceTopic(workspaceId) : null;
  }

  configureAgentChatClient(windowId: string, tabId: string): void {
    const window = this.window;
    const chat = window?.getAgentChat(tabId);
    if (!window || !chat) {
      return;
    }

    chat.client.setWorkspaceTopicResolver(
      () =>
        this.getTabWorkspaceTopic(windowId, tabId) ??
        this.getWorkspaceTopic(this.getSelectedWorkspaceId(windowId)),
    );
    chat.client.setWorkspaceTabsResolver(() => this.getSnapshot(windowId).tabs);
    chat.client.setEnsureBrowserTabResolver((targetTabId) =>
      this.ensureBrowserTabMaterialized(windowId, targetTabId),
    );
    chat.client.setCreateBrowserTabResolver((url) => {
      const snapshot = this.createTab(windowId);
      if (!snapshot) {
        return null;
      }

      const normalized = normalizeAddressBarInput(url.trim(), true);
      if (!normalized) {
        return null;
      }

      this.submitAddressBar(windowId, snapshot.id, normalized);
      return {
        tabId: snapshot.id,
        title: snapshot.title,
        url: normalized,
      };
    });
    chat.client.setSwitchBrowserTabResolver((targetTabId) =>
      this.switchTab(windowId, targetTabId),
    );
  }

  ensureBrowserTabMaterialized(windowId: string, tabId: string): Tab | null {
    const window = this.window;
    if (!window) {
      return null;
    }

    const existing = window.getTab(tabId);
    if (existing) {
      return existing;
    }

    const workspaceId = this.findTabWorkspace(tabId, windowId);
    if (!workspaceId) {
      return null;
    }

    const kind = this.getTabKind(workspaceId, tabId);
    if (kind !== "browser" && kind !== "pending") {
      return null;
    }

    const record = this.getTabRecord(workspaceId, tabId);
    return window.materializeTab(
      tabId,
      record?.url ?? PENDING_TAB_URL,
      (changedTabId, title, changedUrl) => {
        this.handleTabStateChanged(windowId, changedTabId, title, changedUrl);
      },
      record?.title,
      record?.history,
    );
  }

  private findTabWorkspace(tabId: string, _windowId: string): string | null {
    for (const [workspaceId, workspace] of this.projection.workspaces) {
      if (workspace.tabs.has(tabId)) {
        return workspaceId;
      }
    }

    const window = this.window;
    if (window?.getTab(tabId) || window?.getAgentChat(tabId)) {
      return DEFAULT_WORKSPACE_ID;
    }

    return null;
  }

  createTab(windowId: string): TabSnapshot | null {
    const window = this.window;
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

    this.publishDomainEvent(topic, "tab-activated", { tabId });
    this.notifyStateChanged();
    this.focusAddressBar();

    return {
      id: tabId,
      title: "New Tab",
      url: PENDING_TAB_URL,
      kind: "pending",
      isActive: true,
      workspaceId,
    };
  }

  submitAddressBar(windowId: string, tabId: string, input: string): boolean {
    const window = this.window;
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

  private commitPendingTab(windowId: string, tabId: string, url: string): void {
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

    const tab = this.window?.getTab(tabId);
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
    const window = this.window;
    const workspaceId = this.findTabWorkspace(tabId, windowId);
    if (!window || !workspaceId) {
      return;
    }

    const trimmedMessage = initialMessage.trim();
    const title =
      trimmedMessage.length <= 40
        ? trimmedMessage
        : `${trimmedMessage.slice(0, 39)}…`;
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

    const messageId = Date.now().toString();
    this.configureAgentChatClient(windowId, tabId);
    const chatEvent = eventDatabase.publish(
      topic,
      1,
      { tabId, message: initialMessage, messageId },
      "agent-chat-message",
      { kind: "invoke" },
      "rpc-meta",
    );
    this.broadcastEvent(chatEvent);

    void chat.client.sendChatMessage(
      { message: initialMessage, messageId },
      chatEvent.id,
    );

    this.notifyStateChanged();
  }

  closeTab(windowId: string, tabId: string): boolean {
    const window = this.window;
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
    const window = this.window;
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
      this.configureAgentChatClient(windowId, tabId);
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

  showContextDashboard(_windowId: string): boolean {
    const window = this.window;
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

    const window = this.window;
    if (!window) {
      return false;
    }

    const topic = this.getWorkspaceTopic(workspaceId);
    this.publishDomainEvent(topic, "workspace-switched", {
      windowId,
      workspaceId,
    });

    this.selectedWorkspaceId = workspaceId;

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

    const window = this.window;
    if (window) {
      if (this.selectedWorkspaceId === workspaceId) {
        this.selectedWorkspaceId = DEFAULT_WORKSPACE_ID;
        this.switchWorkspace(window.id, DEFAULT_WORKSPACE_ID);
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

    const window = this.window;
    if (!window) {
      return false;
    }

    const tab = window.getTab(tabId);
    const record = this.getTabRecord(sourceWorkspaceId, tabId);
    const kind = record?.kind ?? "browser";
    const url = tab?.url ?? record?.url ?? PENDING_TAB_URL;
    const title = tab?.title ?? record?.title ?? "New Tab";
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

    const record = this.getTabRecord(workspaceId, tabId);
    if (isBlankTabUrl(url) && record && !isBlankTabUrl(record.url)) {
      this.notifyStateChanged();
      return;
    }

    const topic = this.getWorkspaceTopic(workspaceId);

    if (record && record.url !== url) {
      this.publishDomainEvent(topic, "tab-url-changed", { tabId, url });
    }

    if (record && record.title !== title) {
      this.publishDomainEvent(topic, "tab-title-changed", { tabId, title });
    }

    this.notifyStateChanged();
  }

  handleNavigateTab(windowId: string, tabId: string, url: string): void {
    const window = this.window;
    const tab = window?.getTab(tabId);
    if (!tab) {
      return;
    }

    const workspaceId = this.findTabWorkspace(tabId, windowId);
    if (!workspaceId) {
      this.notifyStateChanged();
      return;
    }

    const kind = this.getTabKind(workspaceId, tabId);
    if (kind === "pending") {
      this.commitPendingTab(windowId, tabId, url);
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

    this.notifyStateChanged();
  }
}
