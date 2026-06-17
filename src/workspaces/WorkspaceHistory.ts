import type { Event, WorkspaceEventPayloads } from "../events/types";
import type { GlobalWorkspaceProjection, TabHistorySnapshot } from "./types";

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

export class TabHistoryAggregator {
  private histories = new Map<string, TabHistorySnapshot>();
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
        const { tabId } = row.payload as WorkspaceEventPayloads["tab-closed"];
        this.histories.delete(tabId);
        if (this.activeTabId === tabId) {
          this.activeTabId = null;
        }
        break;
      }
      case "tab-activated": {
        const { tabId } =
          row.payload as WorkspaceEventPayloads["tab-activated"];
        this.activeTabId = tabId;
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
