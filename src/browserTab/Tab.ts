import { NativeImage, WebContentsView } from "electron";
import type { TabHistorySnapshot } from "../workspaces/types";
import { isBlankTabUrl } from "../workspaces/types";
import type { TabStateCallback } from "./types";

export class Tab {
  private webContentsView: WebContentsView;
  private _id: string;
  private _title: string;
  private _url: string;
  private _isVisible: boolean = false;
  private onStateChanged: TabStateCallback | undefined;

  constructor(
    id: string,
    url: string = "https://www.google.com",
    onStateChanged?: TabStateCallback,
    title: string = "New Tab",
    history?: TabHistorySnapshot,
  ) {
    this._id = id;
    this._url = this.getInitialUrl(url, history);
    this._title = title;
    this.onStateChanged = onStateChanged;

    this.webContentsView = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });

    this.setupEventListeners();
    if (history?.entries.length) {
      void this.restoreHistory(history, url);
    } else {
      void this.loadURL(url);
    }
  }

  private setupEventListeners(): void {
    this.webContentsView.webContents.on("page-title-updated", (_, title) => {
      this._title = title;
      this.notifyStateChanged();
    });

    this.webContentsView.webContents.on("did-navigate", (_, url) => {
      if (isBlankTabUrl(url) && !isBlankTabUrl(this._url)) {
        return;
      }
      this._url = url;
      this.notifyStateChanged();
    });

    this.webContentsView.webContents.on("did-navigate-in-page", (_, url) => {
      if (isBlankTabUrl(url) && !isBlankTabUrl(this._url)) {
        return;
      }
      this._url = url;
      this.notifyStateChanged();
    });
  }

  private notifyStateChanged(): void {
    this.onStateChanged?.(this._id, this._title, this._url);
  }

  private getInitialUrl(
    fallbackUrl: string,
    history?: TabHistorySnapshot,
  ): string {
    if (!history || history.entries.length === 0) {
      return fallbackUrl;
    }

    return history.entries[history.index]?.url ?? fallbackUrl;
  }

  private async restoreHistory(
    history: TabHistorySnapshot,
    fallbackUrl: string,
  ): Promise<void> {
    try {
      await this.webContentsView.webContents.navigationHistory.restore(history);
    } catch (error) {
      console.error("Failed to restore tab history:", error);
      await this.loadURL(fallbackUrl);
    }
  }

  get id(): string {
    return this._id;
  }

  get title(): string {
    return this._title;
  }

  get url(): string {
    return this._url;
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  get webContents(): Electron.WebContents {
    return this.webContentsView.webContents;
  }

  get view(): WebContentsView {
    return this.webContentsView;
  }

  show(): void {
    this._isVisible = true;
    this.webContentsView.setVisible(true);
  }

  hide(): void {
    this._isVisible = false;
    this.webContentsView.setVisible(false);
  }

  async screenshot(): Promise<NativeImage> {
    const view = this.webContentsView;

    if (this._isVisible) {
      await this.prepareForCapture();
      return await this.capturePageImage(view);
    }

    const previousBounds = view.getBounds();
    const width = Math.max(previousBounds.width, 1280);
    const height = Math.max(previousBounds.height, 720);

    view.setBounds({ x: -20000, y: -20000, width, height });
    view.setVisible(true);

    try {
      await this.prepareForCapture();
      return await this.capturePageImage(view);
    } finally {
      view.setVisible(false);
      view.setBounds(previousBounds);
    }
  }

  private async capturePageImage(
    view: WebContentsView,
  ): Promise<NativeImage> {
    let image = await view.webContents.capturePage();
    let size = image.getSize();

    if (!image.isEmpty() && size.width > 0 && size.height > 0) {
      return image;
    }

    let dimensions = { width: 1280, height: 720 };
    try {
      dimensions = (await this.runJsWithTimeout(`({
        width: Math.max(1, Math.min(window.innerWidth || document.documentElement.clientWidth || 1280, 1280)),
        height: Math.max(1, Math.min(window.innerHeight || document.documentElement.clientHeight || 720, 720))
      })`, 2000)) as { width: number; height: number };
    } catch (error) {
      console.error("Failed to read screenshot dimensions, using defaults:", error);
    }

    image = await view.webContents.capturePage({
      x: 0,
      y: 0,
      width: Math.round(dimensions.width),
      height: Math.round(dimensions.height),
    });
    size = image.getSize();

    if (image.isEmpty() || size.width === 0 || size.height === 0) {
      throw new Error("Failed to capture a non-empty screenshot for this tab.");
    }

    return image;
  }

  async runJs(code: string): Promise<unknown> {
    return await this.webContentsView.webContents.executeJavaScript(code);
  }

  private async runJsWithTimeout(
    code: string,
    timeoutMs = 3000,
  ): Promise<unknown> {
    return await Promise.race([
      this.runJs(code),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("JS execution timed out")), timeoutMs);
      }),
    ]);
  }

  async getTabText(): Promise<string> {
    const readText = async (): Promise<string> =>
      (await this.runJsWithTimeout(
        "document.documentElement.innerText",
        5000,
      )) as string;

    if (this._isVisible) {
      await this.prepareForCapture();
      return readText();
    }

    const previousBounds = this.view.getBounds();
    const width = Math.max(previousBounds.width, 1280);
    const height = Math.max(previousBounds.height, 720);

    this.view.setBounds({ x: -20000, y: -20000, width, height });
    this.view.setVisible(true);

    try {
      await this.prepareForCapture();
      return await readText();
    } finally {
      this.view.setVisible(false);
      this.view.setBounds(previousBounds);
    }
  }

  private async prepareForCapture(timeoutMs = 6000): Promise<void> {
    await this.waitForAnyLoad(timeoutMs);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  async waitForLoad(timeoutMs = 15000): Promise<void> {
    await this.waitForAnyLoad(timeoutMs);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  private async waitForAnyLoad(timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      let settled = false;
      let idleProbe: NodeJS.Timeout | undefined;

      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
      };

      const timer = setTimeout(finish, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        if (idleProbe) {
          clearTimeout(idleProbe);
        }
        this.webContents.removeListener("did-finish-load", finish);
        this.webContents.removeListener("did-fail-load", finish);
        this.webContents.removeListener("dom-ready", onDomReady);
      };

      const onDomReady = () => {
        if (!this.webContents.isLoading()) {
          finish();
        }
      };

      this.webContents.once("did-finish-load", finish);
      this.webContents.once("did-fail-load", finish);
      this.webContents.once("dom-ready", onDomReady);

      if (!this.webContents.isLoading()) {
        idleProbe = setTimeout(() => {
          if (!this.webContents.isLoading()) {
            finish();
          }
        }, 300);
      }
    });
  }

  loadURL(url: string): Promise<void> {
    if (!isBlankTabUrl(url) && this.webContents.isLoading()) {
      this.stop();
    }
    this._url = url;
    this.notifyStateChanged();
    return this.webContentsView.webContents.loadURL(url);
  }

  goBack(): void {
    if (this.webContentsView.webContents.navigationHistory.canGoBack()) {
      this.webContentsView.webContents.navigationHistory.goBack();
    }
  }

  goForward(): void {
    if (this.webContentsView.webContents.navigationHistory.canGoForward()) {
      this.webContentsView.webContents.navigationHistory.goForward();
    }
  }

  reload(): void {
    this.webContentsView.webContents.reload();
  }

  stop(): void {
    this.webContentsView.webContents.stop();
  }

  destroy(): void {
    this.webContentsView.webContents.close();
  }
}
