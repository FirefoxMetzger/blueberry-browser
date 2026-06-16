import { is } from "@electron-toolkit/utils";
import { BaseWindow, WebContentsView } from "electron";
import { join } from "path";
import { TOPBAR_BASE_HEIGHT } from "../main/layout";

export const EVENT_PANEL_WIDTH = 280;

export class EventPanel {
  private webContentsView: WebContentsView;
  private baseWindow: BaseWindow;

  constructor(baseWindow: BaseWindow) {
    this.baseWindow = baseWindow;
    this.webContentsView = this.createWebContentsView();
    baseWindow.contentView.addChildView(this.webContentsView);
    this.setupBounds();
  }

  private createWebContentsView(): WebContentsView {
    const webContentsView = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, "../preload/preloadEventPanel.js"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      const eventPanelUrl = new URL(
        "/eventPanel/renderer/",
        process.env["ELECTRON_RENDERER_URL"],
      );
      webContentsView.webContents.loadURL(eventPanelUrl.toString());
    } else {
      webContentsView.webContents.loadFile(
        join(__dirname, "../renderer/eventPanel/renderer/index.html"),
      );
    }

    return webContentsView;
  }

  private setupBounds(contentTop = TOPBAR_BASE_HEIGHT): void {
    const bounds = this.baseWindow.getBounds();
    this.webContentsView.setBounds({
      x: 0,
      y: contentTop,
      width: EVENT_PANEL_WIDTH,
      height: bounds.height - contentTop,
    });
  }

  updateBounds(contentTop = TOPBAR_BASE_HEIGHT): void {
    this.setupBounds(contentTop);
  }

  get view(): WebContentsView {
    return this.webContentsView;
  }
}
