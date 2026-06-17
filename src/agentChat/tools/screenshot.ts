import { tool } from "ai";
import { z } from "zod";
import type { TabSnapshot } from "../../workspaces/types";
import type { AgentToolContext, ScreenshotResult } from "./types";

function imageDataUrlToBase64(dataUrl: string): string {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  return match?.[1] ?? dataUrl;
}

function imageDataUrlMediaType(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] ?? "image/png";
}

function getBrowserTabs(context: AgentToolContext): TabSnapshot[] {
  return context.getWorkspaceTabs().filter(
    (tab) => tab.kind === "browser" || tab.kind === "pending",
  );
}

function resolveBrowserTab(
  context: AgentToolContext,
  tabId?: string,
  query?: string,
): TabSnapshot | null {
  const browserTabs = getBrowserTabs(context);

  if (tabId) {
    return browserTabs.find((tab) => tab.id === tabId) ?? null;
  }

  if (query?.trim()) {
    const normalized = query.trim().toLowerCase();
    return (
      browserTabs.find(
        (tab) =>
          tab.title.toLowerCase().includes(normalized) ||
          tab.url.toLowerCase().includes(normalized),
      ) ?? null
    );
  }

  return browserTabs[0] ?? null;
}

function formatAvailableTabs(context: AgentToolContext): string {
  const tabs = getBrowserTabs(context);
  if (tabs.length === 0) {
    return "none";
  }

  return tabs
    .map((tab) => `${tab.title} (${tab.url}) [id: ${tab.id}]`)
    .join("; ");
}

export async function captureTabScreenshot(
  context: AgentToolContext,
  options: { tab_id?: string; query?: string } = {},
): Promise<ScreenshotResult> {
  const tab = resolveBrowserTab(context, options.tab_id, options.query);
  if (!tab) {
    throw new Error(
      `No matching browser tab found. Available tabs: ${formatAvailableTabs(context)}`,
    );
  }

  let materialized = context.window.getTab(tab.id);
  if (!materialized) {
    materialized = context.ensureBrowserTab?.(tab.id) ?? null;
  }
  if (!materialized) {
    throw new Error(
      `Browser tab "${tab.title}" is not loaded. Available tabs: ${formatAvailableTabs(context)}`,
    );
  }

  const image = await materialized.screenshot();
  const size = image.getSize();

  if (image.isEmpty() || size.width === 0 || size.height === 0) {
    throw new Error(
      `Screenshot failed: captured image is empty for "${tab.title}".`,
    );
  }

  return {
    tabId: tab.id,
    title: materialized.title || tab.title,
    url: materialized.url || tab.url,
    width: size.width,
    height: size.height,
    imageDataUrl: image.toDataURL(),
  };
}

export function createScreenshotTool(context: AgentToolContext) {
  return tool({
    description:
      "Capture a screenshot of a browser tab in the current workspace. Use query to match by tab title or URL (e.g. 'facebook'), or tab_id for an exact tab ID. Returns the screenshot image for visual analysis.",
    inputSchema: z.object({
      tab_id: z.string().optional().describe("Exact tab ID to screenshot."),
      query: z
        .string()
        .optional()
        .describe(
          "Match a browser tab by title or URL substring, e.g. 'reddit' or 'facebook.com'.",
        ),
    }),
    execute: async ({ tab_id, query }) => {
      return captureTabScreenshot(context, { tab_id, query });
    },
    toModelOutput: (result) => {
      if (!result || typeof result !== "object") {
        return {
          type: "text" as const,
          value: "Screenshot capture returned no data.",
        };
      }

      const capture = result as ScreenshotResult;

      return {
        type: "content" as const,
        value: [
          {
            type: "text" as const,
            text: `Screenshot of "${capture.title}" (${capture.url}) — ${capture.width}×${capture.height}px`,
          },
          {
            type: "media" as const,
            data: imageDataUrlToBase64(capture.imageDataUrl),
            mediaType: imageDataUrlMediaType(capture.imageDataUrl),
          },
        ],
      };
    },
  });
}
