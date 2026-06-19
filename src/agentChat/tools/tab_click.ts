import { type Tool } from "ai";
import { z } from "zod";
import { defineAgentTool } from "./defineAgentTool";
import { runPageAction, type PageActionResult } from "./tab_utils";
import type { AgentToolContext } from "./types";

export const name = "click_tab" as const;

interface Input {
  tab_id?: string;
  query?: string;
  x?: number;
  y?: number;
  selector?: string;
  shift_key?: boolean;
}

const inputSchema = z.object({
  tab_id: z.string().optional().describe("Exact browser tab ID to target."),
  query: z
    .string()
    .optional()
    .describe(
      "Match a browser tab by title or URL substring. Defaults to the active browser tab.",
    ),
  x: z.number().optional().describe("Viewport X coordinate for the click."),
  y: z.number().optional().describe("Viewport Y coordinate for the click."),
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
}) satisfies z.ZodType<Input>;

type Output = PageActionResult;

export function create(context: AgentToolContext): Tool {
  return defineAgentTool({
    description:
      "Click within a browser tab using viewport coordinates from a screenshot, or a CSS selector. Set shift_key to open links in a new tab.",
    inputSchema,
    execute: async (input: Input): Promise<Output> => {
      const hasCoordinates = input.x !== undefined && input.y !== undefined;
      const hasSelector = Boolean(input.selector?.trim());

      if (!hasCoordinates && !hasSelector) {
        throw new Error("Provide x and y coordinates, or a CSS selector.");
      }

      const clickOptions = {
        x: input.x,
        y: input.y,
        selector: input.selector?.trim() || undefined,
        shiftKey: input.shift_key ?? false,
      };

      const script = `(() => {
    const opts = ${JSON.stringify(clickOptions)};
    let target = null;

    if (opts.selector) {
      target = document.querySelector(opts.selector);
    } else if (typeof opts.x === "number" && typeof opts.y === "number") {
      target = document.elementFromPoint(opts.x, opts.y);
    }

    if (!target || !(target instanceof Element)) {
      return { success: false, reason: "no clickable target found" };
    }

    target.scrollIntoView({ behavior: "instant", block: "nearest", inline: "nearest" });

    const rect = target.getBoundingClientRect();
    const clientX =
      typeof opts.x === "number" ? opts.x : rect.left + rect.width / 2;
    const clientY =
      typeof opts.y === "number" ? opts.y : rect.top + rect.height / 2;
    const shiftKey = Boolean(opts.shiftKey);

    if (
      shiftKey &&
      target instanceof HTMLAnchorElement &&
      target.href &&
      target.href !== "#"
    ) {
      window.open(target.href, "_blank", "noopener,noreferrer");
      return {
        success: true,
        action: "opened in new tab",
        href: target.href,
        tag: target.tagName,
      };
    }

    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY,
      shiftKey,
      button: 0,
    };

    target.dispatchEvent(
      new PointerEvent("pointerdown", {
        ...eventInit,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    target.dispatchEvent(new MouseEvent("mousedown", eventInit));
    target.dispatchEvent(
      new PointerEvent("pointerup", {
        ...eventInit,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    target.dispatchEvent(new MouseEvent("mouseup", eventInit));
    target.dispatchEvent(new MouseEvent("click", eventInit));

    return {
      success: true,
      action: "clicked",
      tag: target.tagName,
      text: (target.textContent || "").trim().slice(0, 120),
      x: clientX,
      y: clientY,
      shiftKey,
    };
  })()`;

      return runPageAction(context, input.tab_id, input.query, script);
    },
  });
}
