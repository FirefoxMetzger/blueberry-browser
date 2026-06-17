export const DEFAULT_WORKSPACE_TOPIC = "default";
const LEGACY_WORKSPACE_TOPIC_PREFIX = "workspace:";

export interface WorkspaceInfo {
  id: string;
  name: string;
  topic: string;
  tabCount: number;
  isDefault: boolean;
  isActive?: boolean;
}

export interface TabHistorySnapshot {
  entries: Electron.NavigationEntry[];
  index: number;
}

export interface TabRecord {
  id: string;
  title: string;
  url: string;
  history?: TabHistorySnapshot;
}

export interface WorkspaceState {
  id: string;
  name: string;
  topic: string;
  tabOrder: string[];
  tabs: Map<string, TabRecord>;
  lastActiveTabId: string | null;
}

export interface GlobalWorkspaceProjection {
  workspaces: Map<string, WorkspaceState>;
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

export function workspaceTopic(workspaceName: string): string {
  return workspaceName;
}

export function parseLegacyWorkspaceTopic(topic: string): string | null {
  if (!topic.startsWith(LEGACY_WORKSPACE_TOPIC_PREFIX)) {
    return null;
  }
  return topic.slice(LEGACY_WORKSPACE_TOPIC_PREFIX.length);
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
