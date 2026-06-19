import { type Tool } from "ai";
import { z } from "zod";
import { defineAgentTool } from "./defineAgentTool";
import { runPageAction, type PageActionResult } from "./tab_utils";
import type { AgentToolContext } from "./types";

export const name = "type_tab" as const;

interface Input {
  tab_id?: string;
  query?: string;
  text: string;
  selector?: string;
  clear_first?: boolean;
}

const inputSchema = z.object({
  tab_id: z.string().optional().describe("Exact browser tab ID to target."),
  query: z
    .string()
    .optional()
    .describe(
      "Match a browser tab by title or URL substring. Defaults to the active browser tab.",
    ),
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
}) satisfies z.ZodType<Input>;

type Output = PageActionResult;

export function create(context: AgentToolContext): Tool {
  return defineAgentTool({
    description:
      "Type text into an editable element in a browser tab. Use selector to target a specific input, textarea, or contenteditable element; otherwise types into the currently focused element.",
    inputSchema,
    execute: async (input: Input): Promise<Output> => {
      if (!input.text.trim()) {
        throw new Error("text is required.");
      }

      const typeOptions = {
        text: input.text,
        selector: input.selector?.trim() || undefined,
        clearFirst: input.clear_first ?? false,
      };

      const script = `(() => {
    const opts = ${JSON.stringify(typeOptions)};
    const text = String(opts.text ?? "");
    if (!text) {
      return { success: false, reason: "text is required" };
    }

    let element = opts.selector
      ? document.querySelector(opts.selector)
      : document.activeElement;

    if (!element || !(element instanceof HTMLElement)) {
      return { success: false, reason: "no editable element found" };
    }

    const isEditable =
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement ||
      element.isContentEditable;

    if (!isEditable) {
      return { success: false, reason: "element is not editable" };
    }

    element.focus();

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (opts.clearFirst) {
        element.value = "";
      }
      element.value = opts.clearFirst ? text : element.value + text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return {
        success: true,
        tag: element.tagName,
        value: element.value.slice(0, 200),
      };
    }

    if (element.isContentEditable) {
      if (opts.clearFirst) {
        element.textContent = "";
      }
      element.textContent = opts.clearFirst
        ? text
        : (element.textContent || "") + text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return {
        success: true,
        tag: element.tagName,
        value: (element.textContent || "").slice(0, 200),
      };
    }

    return { success: false, reason: "unsupported editable element" };
  })()`;

      return runPageAction(context, input.tab_id, input.query, script);
    },
  });
}
