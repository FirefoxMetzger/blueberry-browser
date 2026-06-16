import {
  IpcMainEvent,
  nativeTheme,
  WebContents,
} from "electron";
import type { Window } from "../main/Window";
import type { EventManager } from "../main/events/EventManager";
import { eventDatabase } from "../main/events/database";
import {
  DARK_MODE_CHANGED_TOPIC,
  DARK_MODE_UPDATED_TOPIC,
  LATEST_DARK_MODE_EVENT_QUERY,
  parseDarkModePayload,
} from "./shared";

interface DarkModeEventRow {
  payload: string;
}

export class DarkModeManager {
  constructor(
    private readonly mainWindow: Window,
    private readonly eventManager: EventManager,
  ) {
    this.handleDarkModeEvents();
    this.initializeDarkModeFromHistory();
  }

  private handleDarkModeEvents(): void {
    this.eventManager.on(
      DARK_MODE_CHANGED_TOPIC,
      (event: IpcMainEvent, isDarkMode) => {
        const nextDarkMode = isDarkMode as boolean;
        this.setNativeDarkMode(nextDarkMode);
        this.broadcastDarkMode(event.sender, nextDarkMode);
      },
    );
  }

  private initializeDarkModeFromHistory(): void {
    const rows = eventDatabase.query<DarkModeEventRow>(
      LATEST_DARK_MODE_EVENT_QUERY,
      [DARK_MODE_CHANGED_TOPIC],
    );
    const darkMode = parseDarkModePayload(rows[0]?.payload);
    if (darkMode !== null) {
      this.setNativeDarkMode(darkMode);
    }
  }

  private setNativeDarkMode(isDarkMode: boolean): void {
    nativeTheme.themeSource = isDarkMode ? "dark" : "light";
  }

  private broadcastDarkMode(sender: WebContents, isDarkMode: boolean): void {
    const recipients = [
      this.mainWindow.topBar.view.webContents,
      this.mainWindow.eventPanel.view.webContents,
      this.mainWindow.sidebar.view.webContents,
      ...this.mainWindow.allTabs.map((tab) => tab.webContents),
    ];

    for (const webContents of recipients) {
      if (webContents !== sender) {
        webContents.send(DARK_MODE_UPDATED_TOPIC, isDarkMode);
      }
    }
  }
}
