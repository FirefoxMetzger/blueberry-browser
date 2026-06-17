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

import type { TabKind } from "../workspaces/types";

export interface WorkspaceEventPayloads {
  "tab-created": {
    tabId: string;
    url: string;
    title?: string;
    kind?: TabKind;
  };
  "tab-closed": { tabId: string };
  "tab-url-changed": { tabId: string; url: string };
  "tab-title-changed": { tabId: string; title: string };
  "tab-kind-changed": { tabId: string; kind: TabKind; url?: string; title?: string };
  "tab-activated": { tabId: string };
  "tab-moved": {
    moveId: string;
    tabId: string;
    direction: "in" | "out";
    fromWorkspaceId: string;
    toWorkspaceId: string;
    url: string;
    title: string;
    kind?: TabKind;
  };
  "workspace-created": { workspaceId: string; name: string };
  "workspace-removed": { workspaceId: string };
  "workspace-switched": { windowId: string; workspaceId: string };
}

export type WorkspacePayloadType = keyof WorkspaceEventPayloads;
