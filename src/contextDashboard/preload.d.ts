import { ElectronAPI } from "@electron-toolkit/preload";

interface EventLogEntry {
  id: number;
  topic: string;
  payload_type: string;
  metadata_type: string;
  created: string;
}

interface WorkspaceContext {
  topic: string;
  name: string;
}

interface ContextDashboardAPI {
  getActiveWorkspaceContext: () => Promise<WorkspaceContext>;
  queryDatabase: (sql: string, params?: unknown[]) => Promise<EventLogEntry[]>;
  onEvent: (callback: (event: EventLogEntry) => void) => void;
  removeEventListener: () => void;
  onWorkspaceContextUpdated: (callback: (context: WorkspaceContext) => void) => void;
  removeWorkspaceContextUpdatedListener: () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    contextDashboardAPI: ContextDashboardAPI;
  }
}

export type { EventLogEntry, WorkspaceContext };
