import type { Event } from "../events/types";
import {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_TOPIC,
  parseWorkspaceTopic,
  type GlobalWorkspaceProjection,
  type TabActivatedPayload,
  type TabClosedPayload,
  type TabCreatedPayload,
  type TabMovedPayload,
  type TabTitleChangedPayload,
  type TabUrlChangedPayload,
  type WorkspaceCreatedPayload,
  type WorkspaceRemovedPayload,
  type WorkspaceRenamedPayload,
  type WorkspaceState,
  workspaceTopic,
} from "./types";

function createEmptyWorkspaceState(
  workspaceId: string,
  name: string,
): WorkspaceState {
  return {
    id: workspaceId,
    name,
    topic: workspaceTopic(workspaceId),
    tabOrder: [],
    tabs: new Map(),
    lastActiveTabId: null,
  };
}

export function createEmptyProjection(): GlobalWorkspaceProjection {
  return {
    workspaces: new Map(),
    defaultWorkspaceTabs: new Map(),
    defaultLastActiveTabId: null,
  };
}

function addTabToWorkspace(
  state: WorkspaceState,
  tabId: string,
  url: string,
  title: string,
): void {
  if (!state.tabOrder.includes(tabId)) {
    state.tabOrder.push(tabId);
  }
  state.tabs.set(tabId, {
    id: tabId,
    title,
    url,
    workspaceId: state.id,
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

function applyWorkspaceEvent(
  projection: GlobalWorkspaceProjection,
  payloadType: string,
  payload: unknown,
): void {
  switch (payloadType) {
    case "workspace-created": {
      const { workspaceId, name } = payload as WorkspaceCreatedPayload;
      if (!projection.workspaces.has(workspaceId)) {
        projection.workspaces.set(
          workspaceId,
          createEmptyWorkspaceState(workspaceId, name),
        );
      }
      break;
    }
    case "workspace-renamed": {
      const { workspaceId, name } = payload as WorkspaceRenamedPayload;
      const workspace = projection.workspaces.get(workspaceId);
      if (workspace) {
        workspace.name = name;
      }
      break;
    }
    case "workspace-removed": {
      const { workspaceId } = payload as WorkspaceRemovedPayload;
      projection.workspaces.delete(workspaceId);
      break;
    }
    default:
      break;
  }
}

function applyTabEventToWorkspace(
  state: WorkspaceState,
  payloadType: string,
  payload: unknown,
): void {
  switch (payloadType) {
    case "tab-created": {
      const { tabId, url, title } = payload as TabCreatedPayload;
      addTabToWorkspace(state, tabId, url, title ?? "New Tab");
      state.lastActiveTabId = tabId;
      break;
    }
    case "tab-closed": {
      const { tabId } = payload as TabClosedPayload;
      removeTabFromWorkspace(state, tabId);
      break;
    }
    case "tab-url-changed": {
      const { tabId, url } = payload as TabUrlChangedPayload;
      const tab = state.tabs.get(tabId);
      if (tab) {
        tab.url = url;
      }
      break;
    }
    case "tab-title-changed": {
      const { tabId, title } = payload as TabTitleChangedPayload;
      const tab = state.tabs.get(tabId);
      if (tab) {
        tab.title = title;
      }
      break;
    }
    case "tab-activated": {
      const { tabId } = payload as TabActivatedPayload;
      if (state.tabs.has(tabId)) {
        state.lastActiveTabId = tabId;
      }
      break;
    }
    case "tab-moved": {
      const move = payload as TabMovedPayload;
      if (move.direction === "out") {
        removeTabFromWorkspace(state, move.tabId);
      } else {
        addTabToWorkspace(state, move.tabId, move.url, move.title);
        state.lastActiveTabId = move.tabId;
      }
      break;
    }
    default:
      break;
  }
}

function applyDefaultTabEvent(
  projection: GlobalWorkspaceProjection,
  payloadType: string,
  payload: unknown,
): void {
  switch (payloadType) {
    case "tab-created": {
      const { tabId, url, title } = payload as TabCreatedPayload;
      projection.defaultWorkspaceTabs.set(tabId, {
        id: tabId,
        title: title ?? "New Tab",
        url,
        workspaceId: DEFAULT_WORKSPACE_ID,
      });
      projection.defaultLastActiveTabId = tabId;
      break;
    }
    case "tab-closed": {
      const { tabId } = payload as TabClosedPayload;
      projection.defaultWorkspaceTabs.delete(tabId);
      if (projection.defaultLastActiveTabId === tabId) {
        const remaining = Array.from(projection.defaultWorkspaceTabs.keys());
        projection.defaultLastActiveTabId =
          remaining.length > 0 ? remaining[remaining.length - 1] : null;
      }
      break;
    }
    case "tab-url-changed": {
      const { tabId, url } = payload as TabUrlChangedPayload;
      const tab = projection.defaultWorkspaceTabs.get(tabId);
      if (tab) {
        tab.url = url;
      }
      break;
    }
    case "tab-title-changed": {
      const { tabId, title } = payload as TabTitleChangedPayload;
      const tab = projection.defaultWorkspaceTabs.get(tabId);
      if (tab) {
        tab.title = title;
      }
      break;
    }
    case "tab-activated": {
      const { tabId } = payload as TabActivatedPayload;
      if (projection.defaultWorkspaceTabs.has(tabId)) {
        projection.defaultLastActiveTabId = tabId;
      }
      break;
    }
    case "tab-moved": {
      const move = payload as TabMovedPayload;
      if (move.direction === "out") {
        projection.defaultWorkspaceTabs.delete(move.tabId);
        if (projection.defaultLastActiveTabId === move.tabId) {
          const remaining = Array.from(projection.defaultWorkspaceTabs.keys());
          projection.defaultLastActiveTabId =
            remaining.length > 0 ? remaining[remaining.length - 1] : null;
        }
      }
      break;
    }
    default:
      break;
  }
}

export function applyEventRow(
  projection: GlobalWorkspaceProjection,
  row: Pick<Event, "topic" | "payload_type" | "payload">,
): void {
  const { topic, payload_type: payloadType, payload } = row;

  if (
    payloadType === "workspace-created" ||
    payloadType === "workspace-renamed" ||
    payloadType === "workspace-removed"
  ) {
    applyWorkspaceEvent(projection, payloadType, payload);
    return;
  }

  if (topic === DEFAULT_WORKSPACE_TOPIC) {
    applyDefaultTabEvent(projection, payloadType, payload);
    return;
  }

  const workspaceId = parseWorkspaceTopic(topic);
  if (!workspaceId) {
    return;
  }

  let workspace = projection.workspaces.get(workspaceId);
  if (!workspace && payloadType === "tab-moved") {
    const move = payload as TabMovedPayload;
    if (move.direction === "in") {
      workspace = createEmptyWorkspaceState(workspaceId, workspaceId);
      projection.workspaces.set(workspaceId, workspace);
    }
  }

  if (workspace) {
    applyTabEventToWorkspace(workspace, payloadType, payload);
  }
}

export function replayProjection(
  rows: Pick<Event, "topic" | "payload_type" | "payload">[],
): GlobalWorkspaceProjection {
  const projection = createEmptyProjection();
  for (const row of rows) {
    applyEventRow(projection, row);
  }
  return projection;
}

export function getNamedWorkspaceProjection(
  projection: GlobalWorkspaceProjection,
): GlobalWorkspaceProjection {
  return {
    workspaces: new Map(projection.workspaces),
    defaultWorkspaceTabs: new Map(),
    defaultLastActiveTabId: null,
  };
}
