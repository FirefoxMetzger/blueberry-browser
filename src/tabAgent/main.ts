import { is } from "@electron-toolkit/utils";
import { BaseWindow, WebContentsView } from "electron";
import { join } from "path";
import { LLMClient } from "./LLMClient";
import { TOPBAR_BASE_HEIGHT } from "../topBar/layout";

export class AgentChatView {
  readonly id: string;
  private webContentsView: WebContentsView;
  private baseWindow: BaseWindow;
  private llmClient: LLMClient;
  private isVisible = false;

  constructor(baseWindow: BaseWindow, id: string) {
    this.baseWindow = baseWindow;
    this.id = id;
    this.webContentsView = this.createWebContentsView();
    baseWindow.contentView.addChildView(this.webContentsView);
    this.webContentsView.setVisible(false);
    this.llmClient = new LLMClient(this.webContentsView.webContents, id);
  }

  private createWebContentsView(): WebContentsView {
    const webContentsView = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, "../preload/agentChat.js"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      const agentChatUrl = new URL(
        "/agentChat/renderer/",
        process.env["ELECTRON_RENDERER_URL"],
      );
      webContentsView.webContents.loadURL(agentChatUrl.toString());
    } else {
      webContentsView.webContents.loadFile(
        join(__dirname, "../renderer/agentChat/renderer/index.html"),
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

  get view(): WebContentsView {
    return this.webContentsView;
  }

  get client(): LLMClient {
    return this.llmClient;
  }

  destroy(): void {
    this.webContentsView.webContents.close();
  }
}
