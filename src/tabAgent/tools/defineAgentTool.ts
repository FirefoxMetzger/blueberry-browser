import { tool, type Tool } from "ai";

/** Wraps `tool()` and erases schema inference so tsc stays fast. */
export function defineAgentTool(definition: object): Tool {
  return tool(definition as never) as Tool;
}
