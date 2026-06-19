import { tool } from "ai";
import { z } from "zod";
import {
  getMaterializedTab,
  requireBrowserTab,
} from "./tabUtils";
import type { AgentToolContext, ScreenshotResult } from "./types";

export async function captureTabScreenshot(
  context: AgentToolContext,
  options: { tab_id?: string; query?: string } = {},
): Promise<ScreenshotResult> {
  const tab = requireBrowserTab(context, options.tab_id, options.query);
  const materialized = await getMaterializedTab(context, tab);

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
      const base64Match = capture.imageDataUrl.match(/^data:[^;]+;base64,(.+)$/);
      const mediaTypeMatch = capture.imageDataUrl.match(/^data:([^;]+);base64,/);

      return {
        type: "content" as const,
        value: [
          {
            type: "text" as const,
            text: `Screenshot of "${capture.title}" (${capture.url}) — ${capture.width}×${capture.height}px`,
          },
          {
            type: "media" as const,
            data: base64Match?.[1] ?? capture.imageDataUrl,
            mediaType: mediaTypeMatch?.[1] ?? "image/png",
          },
        ],
      };
    },
  });
}
