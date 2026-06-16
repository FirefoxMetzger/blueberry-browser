import { app, BrowserWindow } from "electron";
import { electronApp } from "@electron-toolkit/utils";
import { Window } from "./Window";
import { AppMenu } from "../menuBar/mainMenu";
import { EventManager } from "./events/EventManager";
import { eventDatabase } from "./events";
import { DarkModeManager } from "../darkMode/mainDarkMode";
import { WorkspaceManager } from "./workspaces";

let mainWindow: Window | null = null;
let eventManager: EventManager | null = null;
let workspaceManager: WorkspaceManager | null = null;
let menu: AppMenu | null = null;

const createWindow = (): Window => {
  const window = new Window();
  workspaceManager!.registerWindow(window);
  eventManager = new EventManager(window, workspaceManager!);
  menu = new AppMenu(window, workspaceManager!, (channel, args) =>
    eventManager?.publishMenuAction(channel, args),
  );
  new DarkModeManager(window, eventManager);
  eventManager.broadcastWorkspaceState(window);
  return window;
};

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.electron");

  eventDatabase.init();

  workspaceManager = new WorkspaceManager((event) => {
    eventManager?.broadcastEvent(event);
  });

  mainWindow = createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on("will-quit", () => {
  eventDatabase.close();
});

app.on("window-all-closed", () => {
  if (eventManager) {
    eventManager.cleanup();
    eventManager = null;
  }

  if (mainWindow) {
    workspaceManager?.unregisterWindow(mainWindow.id);
    mainWindow = null;
  }

  if (menu) {
    menu = null;
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
