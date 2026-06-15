/**
 * new-tab.js
 *
 * Creates a new browser tab in Blueberry Browser.
 *
 * Why this script exists:
 *   The Chrome DevTools Protocol cannot create tabs in this app. `Target.createTarget`
 *   returns "Not supported" because tabs are not Chromium browser-level targets — each
 *   tab is an Electron `WebContentsView` created by the main process (`Window.createTab`).
 *
 * How it works:
 *   The topbar renderer exposes `window.topBarAPI.createTab(url)` (see
 *   `src/preload/topbar.ts`), which sends the `create-tab` IPC message to the main
 *   process. Unlike the "+" button in the UI (which hardcodes google.com), this lets us
 *   choose the URL.
 *
 * How to run it (via the chrome-devtools MCP):
 *   1. select_page -> the TOPBAR page (http://localhost:5173/topbar/).
 *      The API only exists on the topbar renderer, not on web content tabs.
 *   2. evaluate_script with the function below.
 *
 * Example evaluate_script payload:
 *   { "function": "async () => { await window.topBarAPI.createTab('https://example.com'); return 'ok'; }" }
 */

/**
 * @param {string} [url] URL to open. Defaults to google.com (the app's default).
 * @returns {Promise<string>} status message
 */
async function createTab(url = "https://www.google.com") {
  if (!window.topBarAPI || typeof window.topBarAPI.createTab !== "function") {
    throw new Error(
      "topBarAPI.createTab is unavailable — make sure this runs on the topbar page"
    );
  }
  await window.topBarAPI.createTab(url);
  return `created tab: ${url}`;
}

// Allow running directly on the topbar page (e.g. pasted into its devtools console).
if (typeof window !== "undefined" && window.topBarAPI) {
  // eslint-disable-next-line no-unused-expressions
  createTab;
}

export { createTab };
