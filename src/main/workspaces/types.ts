export const DEFAULT_WORKSPACE_TOPIC = "default";
export const WORKSPACE_TOPIC_PREFIX = "workspace:";

export interface WorkspaceInfo {
  id: string;
  name: string;
  topic: string;
  tabCount: number;
  isDefault: boolean;
  isActive?: boolean;
}

export interface WorkspaceTabRecord {
  id: string;
  title: string;
  url: string;
  workspaceId: string;
  history?: TabHistorySnapshot;
}

export interface TabHistorySnapshot {
  entries: Electron.NavigationEntry[];
  index: number;
}

export interface WorkspaceState {
  id: string;
  name: string;
  topic: string;
  tabOrder: string[];
  tabs: Map<string, WorkspaceTabRecord>;
  lastActiveTabId: string | null;
}

export interface GlobalWorkspaceProjection {
  workspaces: Map<string, WorkspaceState>;
  defaultWorkspaceTabs: Map<string, WorkspaceTabRecord>;
  defaultLastActiveTabId: string | null;
}

export interface WorkspaceSnapshot {
  workspaces: WorkspaceInfo[];
  activeWorkspaceId: string;
  tabs: TabSnapshot[];
}

export interface TabSnapshot {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
  workspaceId: string;
}

export interface TabCreatedPayload {
  tabId: string;
  url: string;
  title?: string;
}

export interface TabClosedPayload {
  tabId: string;
}

export interface TabUrlChangedPayload {
  tabId: string;
  url: string;
}

export interface TabTitleChangedPayload {
  tabId: string;
  title: string;
}

export interface TabActivatedPayload {
  tabId: string;
}

export interface TabMovedPayload {
  moveId: string;
  tabId: string;
  direction: "in" | "out";
  fromWorkspaceId: string;
  toWorkspaceId: string;
  url: string;
  title: string;
}

export interface WorkspaceCreatedPayload {
  workspaceId: string;
  name: string;
}

export interface WorkspaceRenamedPayload {
  workspaceId: string;
  name: string;
}

export interface WorkspaceRemovedPayload {
  workspaceId: string;
}

export type WorkspacePayloadType =
  | "workspace-created"
  | "workspace-renamed"
  | "workspace-removed"
  | "tab-created"
  | "tab-closed"
  | "tab-url-changed"
  | "tab-title-changed"
  | "tab-activated"
  | "tab-moved";

export function workspaceTopic(workspaceName: string): string {
  return `${WORKSPACE_TOPIC_PREFIX}${workspaceName}`;
}

export function parseWorkspaceTopic(topic: string): string | null {
  if (!topic.startsWith(WORKSPACE_TOPIC_PREFIX)) {
    return null;
  }
  return topic.slice(WORKSPACE_TOPIC_PREFIX.length);
}

export function createWorkspaceId(): string {
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createMoveId(): string {
  return `move-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const DEFAULT_WORKSPACE_ID = "default";
