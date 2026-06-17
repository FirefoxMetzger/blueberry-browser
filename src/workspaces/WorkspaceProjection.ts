import type { Event, WorkspaceEventPayloads } from "../events/types";
import {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_TOPIC,
  parseLegacyWorkspaceTopic,
  type GlobalWorkspaceProjection,
  type WorkspaceState,
  workspaceTopic,
} from "./types";

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

export function createEmptyProjection(): GlobalWorkspaceProjection {
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
): void {
  if (!state.tabOrder.includes(tabId)) {
    state.tabOrder.push(tabId);
  }
  state.tabs.set(tabId, {
    id: tabId,
    title,
    url,
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
      const { workspaceId, name } =
        payload as WorkspaceEventPayloads["workspace-created"];
      if (!projection.workspaces.has(workspaceId)) {
        projection.workspaces.set(
          workspaceId,
          createEmptyWorkspaceState(workspaceId, name),
        );
      }
      break;
    }
    case "workspace-renamed": {
      const { workspaceId, name } =
        payload as WorkspaceEventPayloads["workspace-renamed"];
      const workspace = projection.workspaces.get(workspaceId);
      if (workspace) {
        workspace.name = name;
        workspace.topic = workspaceTopic(name);
      }
      break;
    }
    case "workspace-removed": {
      const { workspaceId } =
        payload as WorkspaceEventPayloads["workspace-removed"];
      if (workspaceId !== DEFAULT_WORKSPACE_ID) {
        projection.workspaces.delete(workspaceId);
      }
      break;
    }
    default:
      break;
  }
}

function getWorkspaceByTopic(
  projection: GlobalWorkspaceProjection,
  topic: string,
): WorkspaceState | undefined {
  for (const workspace of projection.workspaces.values()) {
    if (workspace.topic === topic) {
      return workspace;
    }
  }

  const legacyWorkspaceId = parseLegacyWorkspaceTopic(topic);
  return legacyWorkspaceId
    ? projection.workspaces.get(legacyWorkspaceId)
    : undefined;
}

function applyTabEventToWorkspace(
  state: WorkspaceState,
  payloadType: string,
  payload: unknown,
): void {
  switch (payloadType) {
    case "tab-created": {
      const { tabId, url, title } =
        payload as WorkspaceEventPayloads["tab-created"];
      addTabToWorkspace(state, tabId, url, title ?? "New Tab");
      state.lastActiveTabId = tabId;
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
        addTabToWorkspace(state, move.tabId, move.url, move.title);
        state.lastActiveTabId = move.tabId;
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

  if (payloadType === "workspace-switched") {
    return;
  }

  if (!topic) {
    return;
  }

  let workspace = getWorkspaceByTopic(projection, topic);
  if (!workspace && payloadType === "tab-moved") {
    const move = payload as WorkspaceEventPayloads["tab-moved"];
    if (move.direction === "in") {
      workspace = createEmptyWorkspaceState(
        move.toWorkspaceId,
        move.toWorkspaceId,
        topic,
      );
      projection.workspaces.set(move.toWorkspaceId, workspace);
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
