import { app, BrowserWindow } from "electron";
import { electronApp } from "@electron-toolkit/utils";
import { Window } from "./Window";
import { AppMenu } from "../menuBar/Menu";
import { EventManager } from "./events/EventManager";
import { eventDatabase } from "./events";
import { DarkModeManager } from "../darkMode/mainDarkMode";

let mainWindow: Window | null = null;
let eventManager: EventManager | null = null;
let menu: AppMenu | null = null;

const createWindow = (): Window => {
  const window = new Window();
  eventManager = new EventManager(window);
  menu = new AppMenu(window, (channel, args) =>
    eventManager?.publishMenuAction(channel, args),
  );
  new DarkModeManager(window, eventManager);
  return window;
};

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.electron");

  eventDatabase.init();

  mainWindow = createWindow();

  app.on("activate", () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
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

  // Clean up references
  if (mainWindow) {
    mainWindow = null;
  }
  if (menu) {
    menu = null;
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
