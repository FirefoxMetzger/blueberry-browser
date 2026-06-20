import { type Tool } from "ai";
import { z } from "zod";
import { defineAgentTool } from "./defineAgentTool";
import { getMaterializedTab, requireBrowserTab } from "./tab_utils";
import type { AgentToolContext } from "./types";

export const name = "screenshot" as const;

interface Input {
  tab_id?: string;
  query?: string;
}

interface Output {
  tabId: string;
  title: string;
  url: string;
  width: number;
  height: number;
  imageDataUrl: string;
}

export function create(context: AgentToolContext): Tool {
  return defineAgentTool({
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
    }) satisfies z.ZodType<Input>,
    execute: async (input: Input): Promise<Output> => {
      const tab = requireBrowserTab(context, input.tab_id, input.query);
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
    },
    toModelOutput: (result) => {
      if (!result || typeof result !== "object") {
        return {
          type: "text" as const,
          value: "Screenshot capture returned no data.",
        };
      }

      const capture = result as Output;
      const base64Match = capture.imageDataUrl.match(
        /^data:[^;]+;base64,(.+)$/,
      );
      const mediaTypeMatch = capture.imageDataUrl.match(
        /^data:([^;]+);base64,/,
      );

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
