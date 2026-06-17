import type { Event, WorkspaceEventPayloads } from "../events/types";
import type { GlobalWorkspaceProjection, TabHistorySnapshot } from "./types";

type HistoryEventRow = Pick<Event, "payload_type" | "payload">;
type NavigationDirection = -1 | 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getPayloadTabId(payload: unknown): string | null {
  if (Array.isArray(payload)) {
    return typeof payload[0] === "string" ? payload[0] : null;
  }

  if (isRecord(payload) && typeof payload.tabId === "string") {
    return payload.tabId;
  }

  return null;
}

function createNavigationEntry(
  url: string,
  title?: string,
): Electron.NavigationEntry {
  return {
    url,
    title: title ?? url,
  };
}

export class TabHistoryAggregator {
  private histories = new Map<string, TabHistorySnapshot>();
  private pendingDirections = new Map<string, NavigationDirection>();
  private activeTabId: string | null = null;

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
        this.activeTabId = tabId;
        break;
      }
      case "tab-closed": {
        const tabId = getPayloadTabId(row.payload);
        if (tabId) {
          this.histories.delete(tabId);
          this.pendingDirections.delete(tabId);
          if (this.activeTabId === tabId) {
            this.activeTabId = null;
          }
        }
        break;
      }
      case "tab-activated": {
        const tabId = getPayloadTabId(row.payload);
        if (tabId) {
          this.activeTabId = tabId;
        }
        break;
      }
      case "tab-go-back":
      case "go-back": {
        this.markPendingDirection(row.payload, -1);
        break;
      }
      case "tab-go-forward":
      case "go-forward": {
        this.markPendingDirection(row.payload, 1);
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

  private markPendingDirection(
    payload: unknown,
    direction: NavigationDirection,
  ): void {
    const tabId = getPayloadTabId(payload) ?? this.activeTabId;
    if (tabId) {
      this.pendingDirections.set(tabId, direction);
    }
  }

  private applyUrlChange(tabId: string, url: string): void {
    const history = this.ensureHistory(tabId, url);
    const current = history.entries[history.index];
    const direction = this.pendingDirections.get(tabId);

    this.pendingDirections.delete(tabId);

    if (current?.url === url) {
      return;
    }

    if (direction) {
      const targetIndex = history.index + direction;
      const target = history.entries[targetIndex];
      if (target?.url === url) {
        history.index = targetIndex;
        return;
      }
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
