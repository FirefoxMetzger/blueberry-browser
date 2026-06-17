import { tool } from "ai";
import { z } from "zod";
import {
  buildClickScript,
  buildScrollScript,
  buildTypeScript,
} from "./browserScripts";
import {
  getMaterializedTab,
  requireBrowserTab,
} from "./tabUtils";
import type { AgentToolContext } from "./types";

const tabTargetSchema = {
  tab_id: z.string().optional().describe("Exact browser tab ID to target."),
  query: z
    .string()
    .optional()
    .describe(
      "Match a browser tab by title or URL substring. Defaults to the active browser tab.",
    ),
};

interface PageActionResult {
  success: boolean;
  tabId: string;
  title: string;
  url: string;
  returnedToChat?: boolean;
  [key: string]: unknown;
}

interface RunPageActionOptions {
  returnToChat?: boolean;
  waitForLoad?: boolean;
  postActionDelayMs?: number;
}

async function runPageAction(
  context: AgentToolContext,
  tabId: string | undefined,
  query: string | undefined,
  script: string,
  options: RunPageActionOptions = {},
): Promise<PageActionResult> {
  const agentChatTabId = context.currentChatTabId;
  const tab = requireBrowserTab(context, tabId, query);
  const materialized = await getMaterializedTab(context, tab, {
    switchToTab: true,
  });

  if (options.waitForLoad) {
    await materialized.waitForLoad();
  }

  const result = await materialized.runJs(script);

  if (options.postActionDelayMs) {
    await new Promise((resolve) =>
      setTimeout(resolve, options.postActionDelayMs),
    );
  }

  if (options.returnToChat) {
    context.switchBrowserTab?.(agentChatTabId);
  }

  const actionResult =
    result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : { success: false, reason: "script returned no result" };

  return {
    success: Boolean(actionResult.success),
    tabId: tab.id,
    title: materialized.title || tab.title,
    url: materialized.url || tab.url,
    returnedToChat: options.returnToChat ?? false,
    ...actionResult,
  };
}

export function createOpenTabTool(context: AgentToolContext) {
  return tool({
    description:
      "Open a new browser tab and navigate it to a URL or search query. The user is briefly shown the new tab while it loads, then returned to this agent chat. Returns the new tab ID so follow-up tools can target it.",
    inputSchema: z.object({
      url: z
        .string()
        .describe(
          "URL or search query to open, e.g. 'https://example.com' or 'weather in berlin'.",
        ),
    }),
    execute: async ({ url }) => {
      if (!context.createBrowserTab) {
        throw new Error("Opening tabs is not available in this context.");
      }

      const agentChatTabId = context.currentChatTabId;
      const created = context.createBrowserTab(url);
      if (!created) {
        throw new Error(`Failed to open a new tab for "${url}".`);
      }

      context.switchBrowserTab?.(created.tabId);

      let materialized = context.window.getTab(created.tabId);
      if (!materialized) {
        materialized = context.ensureBrowserTab?.(created.tabId) ?? null;
      }

      let loaded = false;
      if (materialized) {
        await materialized.waitForLoad();
        loaded = !materialized.view.webContents.isLoading();
      }

      context.switchBrowserTab?.(agentChatTabId);

      return {
        success: true,
        tabId: created.tabId,
        title: materialized?.title || created.title,
        url: materialized?.url || created.url,
        loaded,
        returnedToChat: true,
      };
    },
  });
}

export function createScrollTabTool(context: AgentToolContext) {
  return tool({
    description:
      "Scroll a browser tab. The user is briefly shown the tab while it loads and scrolls, then returned to this agent chat. Provide delta_x/delta_y to scroll by pixels, scroll_x/scroll_y for an absolute position, or selector to scroll an element into view.",
    inputSchema: z.object({
      ...tabTargetSchema,
      delta_x: z
        .number()
        .optional()
        .describe("Pixels to scroll horizontally. Positive scrolls right."),
      delta_y: z
        .number()
        .optional()
        .describe("Pixels to scroll vertically. Positive scrolls down."),
      scroll_x: z
        .number()
        .optional()
        .describe("Absolute horizontal scroll position in pixels."),
      scroll_y: z
        .number()
        .optional()
        .describe("Absolute vertical scroll position in pixels."),
      selector: z
        .string()
        .optional()
        .describe("CSS selector of an element to scroll into view."),
    }),
    execute: async ({
      tab_id,
      query,
      delta_x,
      delta_y,
      scroll_x,
      scroll_y,
      selector,
    }) => {
      const hasDelta = delta_x !== undefined || delta_y !== undefined;
      const hasPosition = scroll_x !== undefined || scroll_y !== undefined;
      const hasSelector = Boolean(selector?.trim());

      if (!hasDelta && !hasPosition && !hasSelector) {
        throw new Error(
          "Provide delta_x/delta_y, scroll_x/scroll_y, or selector to scroll.",
        );
      }

      return runPageAction(
        context,
        tab_id,
        query,
        buildScrollScript({
          deltaX: delta_x,
          deltaY: delta_y,
          scrollX: scroll_x,
          scrollY: scroll_y,
          selector: selector?.trim() || undefined,
        }),
        {
          returnToChat: true,
          waitForLoad: true,
          postActionDelayMs: 400,
        },
      );
    },
  });
}

export function createClickTabTool(context: AgentToolContext) {
  return tool({
    description:
      "Click within a browser tab using viewport coordinates from a screenshot, or a CSS selector. Set shift_key to open links in a new tab.",
    inputSchema: z.object({
      ...tabTargetSchema,
      x: z
        .number()
        .optional()
        .describe("Viewport X coordinate for the click."),
      y: z
        .number()
        .optional()
        .describe("Viewport Y coordinate for the click."),
      selector: z
        .string()
        .optional()
        .describe("CSS selector of the element to click."),
      shift_key: z
        .boolean()
        .optional()
        .describe(
          "Whether to hold Shift while clicking. Useful for opening links in a new tab.",
        ),
    }),
    execute: async ({ tab_id, query, x, y, selector, shift_key }) => {
      const hasCoordinates = x !== undefined && y !== undefined;
      const hasSelector = Boolean(selector?.trim());

      if (!hasCoordinates && !hasSelector) {
        throw new Error("Provide x and y coordinates, or a CSS selector.");
      }

      return runPageAction(
        context,
        tab_id,
        query,
        buildClickScript({
          x,
          y,
          selector: selector?.trim() || undefined,
          shiftKey: shift_key ?? false,
        }),
      );
    },
  });
}

export function createGoBackTabTool(context: AgentToolContext) {
  return tool({
    description:
      "Navigate backward one step in a browser tab's history.",
    inputSchema: z.object({
      ...tabTargetSchema,
    }),
    execute: async ({ tab_id, query }) => {
      const tab = requireBrowserTab(context, tab_id, query);
      const materialized = await getMaterializedTab(context, tab, {
        switchToTab: true,
      });

      const canGoBack = materialized.view.webContents.navigationHistory.canGoBack();
      if (!canGoBack) {
        return {
          success: false,
          tabId: tab.id,
          title: materialized.title || tab.title,
          url: materialized.url || tab.url,
          reason: "tab has no back history",
        };
      }

      materialized.goBack();
      await new Promise((resolve) => setTimeout(resolve, 400));

      return {
        success: true,
        tabId: tab.id,
        title: materialized.title || tab.title,
        url: materialized.url || tab.url,
      };
    },
  });
}

export function createTypeTabTool(context: AgentToolContext) {
  return tool({
    description:
      "Type text into an editable element in a browser tab. Use selector to target a specific input, textarea, or contenteditable element; otherwise types into the currently focused element.",
    inputSchema: z.object({
      ...tabTargetSchema,
      text: z.string().describe("Text to type into the editable element."),
      selector: z
        .string()
        .optional()
        .describe(
          "CSS selector for the editable element. Omit to use the focused element.",
        ),
      clear_first: z
        .boolean()
        .optional()
        .describe(
          "Whether to clear the field before typing. Defaults to false (append).",
        ),
    }),
    execute: async ({ tab_id, query, text, selector, clear_first }) => {
      if (!text.trim()) {
        throw new Error("text is required.");
      }

      return runPageAction(
        context,
        tab_id,
        query,
        buildTypeScript({
          text,
          selector: selector?.trim() || undefined,
          clearFirst: clear_first ?? false,
        }),
      );
    },
  });
}
