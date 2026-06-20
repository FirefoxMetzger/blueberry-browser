import { is } from "@electron-toolkit/utils";
import { BaseWindow, WebContentsView } from "electron";
import { join } from "path";
import { TOPBAR_BASE_HEIGHT } from "../topBar/layout";

export class ContextDashboard {
  private webContentsView: WebContentsView;
  private baseWindow: BaseWindow;
  private isVisible = false;

  constructor(baseWindow: BaseWindow) {
    this.baseWindow = baseWindow;
    this.webContentsView = this.createWebContentsView();
    baseWindow.contentView.addChildView(this.webContentsView);
    this.webContentsView.setVisible(false);
  }

  private createWebContentsView(): WebContentsView {
    const webContentsView = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, "../preload/contextDashboard.js"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      const contextDashboardUrl = new URL(
        "/tabContext/renderer/",
        process.env["ELECTRON_RENDERER_URL"],
      );
      webContentsView.webContents.loadURL(contextDashboardUrl.toString());
    } else {
      webContentsView.webContents.loadFile(
        join(__dirname, "../renderer/tabContext/renderer/index.html"),
      );
    }

    return webContentsView;
  }

  private setupBounds(contentTop = TOPBAR_BASE_HEIGHT): void {
    const bounds = this.baseWindow.getBounds();
    this.webContentsView.setBounds({
      x: 0,
      y: contentTop,
      width: bounds.width,
      height: bounds.height - contentTop,
    });
  }

  updateBounds(contentTop = TOPBAR_BASE_HEIGHT): void {
    if (this.isVisible) {
      this.setupBounds(contentTop);
    }
  }

  show(contentTop = TOPBAR_BASE_HEIGHT): void {
    this.isVisible = true;
    this.setupBounds(contentTop);
    this.webContentsView.setVisible(true);
  }

  hide(): void {
    this.isVisible = false;
    this.webContentsView.setVisible(false);
  }

  getIsVisible(): boolean {
    return this.isVisible;
  }

  get view(): WebContentsView {
    return this.webContentsView;
  }
}
