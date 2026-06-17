export interface Event<P = unknown, M = unknown> {
  id: number;
  topic: string;
  version: number;
  payload: P;
  payload_type: string;
  metadata: M;
  metadata_type: string;
  created: string;
}

export interface WorkspaceEventPayloads {
  "tab-created": { tabId: string; url: string; title?: string };
  "tab-closed": { tabId: string };
  "tab-url-changed": { tabId: string; url: string };
  "tab-title-changed": { tabId: string; title: string };
  "tab-activated": { tabId: string };
  "tab-moved": {
    moveId: string;
    tabId: string;
    direction: "in" | "out";
    fromWorkspaceId: string;
    toWorkspaceId: string;
    url: string;
    title: string;
  };
  "workspace-created": { workspaceId: string; name: string };
  "workspace-renamed": { workspaceId: string; name: string };
  "workspace-removed": { workspaceId: string };
  "workspace-switched": { windowId: string; workspaceId: string };
}

export type WorkspacePayloadType = keyof WorkspaceEventPayloads;
