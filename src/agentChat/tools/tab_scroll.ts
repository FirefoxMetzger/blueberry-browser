import { type Tool } from "ai";
import { z } from "zod";
import { defineAgentTool } from "./defineAgentTool";
import { runPageAction, type PageActionResult } from "./tab_utils";
import type { AgentToolContext } from "./types";

export const name = "scroll_tab" as const;

interface Input {
  tab_id?: string;
  query?: string;
  delta_x?: number;
  delta_y?: number;
  scroll_x?: number;
  scroll_y?: number;
  selector?: string;
}

const inputSchema = z.object({
  tab_id: z.string().optional().describe("Exact browser tab ID to target."),
  query: z
    .string()
    .optional()
    .describe(
      "Match a browser tab by title or URL substring. Defaults to the active browser tab.",
    ),
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
}) satisfies z.ZodType<Input>;

type Output = PageActionResult;

export function create(context: AgentToolContext): Tool {
  return defineAgentTool({
    description:
      "Scroll a browser tab. The user is briefly shown the tab while it loads and scrolls, then returned to this agent chat. Provide delta_x/delta_y to scroll by pixels, scroll_x/scroll_y for an absolute position, or selector to scroll an element into view.",
    inputSchema,
    execute: async (input: Input): Promise<Output> => {
      const hasDelta =
        input.delta_x !== undefined || input.delta_y !== undefined;
      const hasPosition =
        input.scroll_x !== undefined || input.scroll_y !== undefined;
      const hasSelector = Boolean(input.selector?.trim());

      if (!hasDelta && !hasPosition && !hasSelector) {
        throw new Error(
          "Provide delta_x/delta_y, scroll_x/scroll_y, or selector to scroll.",
        );
      }

      const scrollOptions = {
        deltaX: input.delta_x,
        deltaY: input.delta_y,
        scrollX: input.scroll_x,
        scrollY: input.scroll_y,
        selector: input.selector?.trim() || undefined,
      };

      const script = `(() => {
    const opts = ${JSON.stringify(scrollOptions)};

    if (opts.selector) {
      const element = document.querySelector(opts.selector);
      if (!element) {
        return { success: false, reason: "selector not found" };
      }
      element.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
      return {
        success: true,
        mode: "selector",
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };
    }

    if (typeof opts.scrollY === "number" || typeof opts.scrollX === "number") {
      window.scrollTo({
        left: typeof opts.scrollX === "number" ? opts.scrollX : window.scrollX,
        top: typeof opts.scrollY === "number" ? opts.scrollY : window.scrollY,
        behavior: "instant",
      });
      return {
        success: true,
        mode: "position",
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };
    }

    const deltaX = typeof opts.deltaX === "number" ? opts.deltaX : 0;
    const deltaY = typeof opts.deltaY === "number" ? opts.deltaY : 0;
    if (deltaX === 0 && deltaY === 0) {
      return { success: false, reason: "no scroll parameters provided" };
    }

    window.scrollBy({ left: deltaX, top: deltaY, behavior: "instant" });
    return {
      success: true,
      mode: "delta",
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
  })()`;

      return runPageAction(context, input.tab_id, input.query, script, {
        returnToChat: true,
        waitForLoad: true,
        postActionDelayMs: 400,
      });
    },
  });
}
