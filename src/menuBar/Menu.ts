import { Menu, app } from "electron";
import type { Window } from "../main/Window";

export type MenuEventPublisher = (channel: string, args?: unknown[]) => void;

export class AppMenu {
  private mainWindow: Window;
  private publishEvent: MenuEventPublisher;

  constructor(mainWindow: Window, publishEvent: MenuEventPublisher) {
    this.mainWindow = mainWindow;
    this.publishEvent = publishEvent;
    this.createMenu();
  }

  private createMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: "File",
        submenu: [
          {
            label: "New Tab",
            accelerator: "CmdOrCtrl+T",
            click: () => this.handleNewTab(),
          },
          {
            label: "Close Tab",
            accelerator: "CmdOrCtrl+W",
            click: () => this.handleCloseTab(),
          },
          { type: "separator" },
          {
            label: "Quit",
            accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
            click: () => this.handleQuit(),
          },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { label: "Undo", accelerator: "CmdOrCtrl+Z", role: "undo" },
          { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", role: "redo" },
          { type: "separator" },
          { label: "Cut", accelerator: "CmdOrCtrl+X", role: "cut" },
          { label: "Copy", accelerator: "CmdOrCtrl+C", role: "copy" },
          { label: "Paste", accelerator: "CmdOrCtrl+V", role: "paste" },
          {
            label: "Select All",
            accelerator: "CmdOrCtrl+A",
            role: "selectAll",
          },
        ],
      },
      {
        label: "View",
        submenu: [
          {
            label: "Reload",
            accelerator: "CmdOrCtrl+R",
            click: () => this.handleReload(),
          },
          {
            label: "Force Reload",
            accelerator: "CmdOrCtrl+Shift+R",
            click: () => this.handleForceReload(),
          },
          { type: "separator" },
          {
            label: "Toggle Sidebar",
            accelerator: "CmdOrCtrl+E",
            click: () => this.handleToggleSidebar(),
          },
          { type: "separator" },
          {
            label: "Toggle Developer Tools",
            accelerator:
              process.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
            click: () => this.handleToggleDevTools(),
          },
          {
            label: "Toggle Fullscreen",
            accelerator:
              process.platform === "darwin" ? "Ctrl+Command+F" : "F11",
            click: () => this.handleToggleFullscreen(),
          },
        ],
      },
      {
        label: "Go",
        submenu: [
          {
            label: "Back",
            accelerator: "CmdOrCtrl+Left",
            click: () => this.handleGoBack(),
          },
          {
            label: "Forward",
            accelerator: "CmdOrCtrl+Right",
            click: () => this.handleGoForward(),
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  // Menu action handlers
  private handleNewTab(): void {
    const url = "https://www.google.com";

    this.publishEvent("create-tab", [url]);
    this.mainWindow.createTab(url);
  }

  private handleCloseTab(): void {
    const activeTab = this.mainWindow.activeTab;

    if (activeTab) {
      this.publishEvent("close-tab", [activeTab.id]);
      this.mainWindow.closeTab(activeTab.id);
    }
  }

  private handleQuit(): void {
    this.publishEvent("quit");
    app.quit();
  }

  private handleReload(): void {
    const activeTab = this.mainWindow.activeTab;

    if (activeTab) {
      this.publishEvent("reload", [activeTab.id]);
      activeTab.reload();
    }
  }

  private handleForceReload(): void {
    const activeTab = this.mainWindow.activeTab;

    if (activeTab) {
      this.publishEvent("force-reload", [activeTab.id]);
      activeTab.webContents.reloadIgnoringCache();
    }
  }

  private handleToggleSidebar(): void {
    this.publishEvent("toggle-sidebar");
    this.mainWindow.sidebar.toggle();
    this.mainWindow.updateAllBounds();
  }

  private handleToggleDevTools(): void {
    const activeTab = this.mainWindow.activeTab;

    if (activeTab) {
      this.publishEvent("toggle-dev-tools", [activeTab.id]);
      activeTab.webContents.toggleDevTools();
    }
  }

  private handleToggleFullscreen(): void {
    const isFullScreen = this.mainWindow.baseWindow.isFullScreen();

    this.publishEvent("toggle-fullscreen", [!isFullScreen]);
    this.mainWindow.baseWindow.setFullScreen(!isFullScreen);
  }

  private handleGoBack(): void {
    const activeTab = this.mainWindow.activeTab;

    if (activeTab) {
      this.publishEvent("go-back", [activeTab.id]);
      activeTab.goBack();
    }
  }

  private handleGoForward(): void {
    const activeTab = this.mainWindow.activeTab;

    if (activeTab) {
      this.publishEvent("go-forward", [activeTab.id]);
      activeTab.goForward();
    }
  }
}
