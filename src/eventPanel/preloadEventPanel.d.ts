import { ElectronAPI } from "@electron-toolkit/preload";

interface EventLogEntry {
  id: number;
  topic: string;
  payload_type: string;
  metadata_type: string;
  created: string;
}

interface EventPanelAPI {
  queryDatabase: (sql: string, params?: unknown[]) => Promise<EventLogEntry[]>;
  onEvent: (callback: (event: EventLogEntry) => void) => void;
  removeEventListener: () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    eventPanelAPI: EventPanelAPI;
  }
}
