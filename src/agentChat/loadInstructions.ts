import { is } from "@electron-toolkit/utils";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let cachedInstructions: string | null = null;

export function loadAgentInstructions(): string {
  if (cachedInstructions !== null) {
    return cachedInstructions;
  }

  const filePath = is.dev
    ? join(__dirname, "../../src/agentChat/instructions.md")
    : join(__dirname, "instructions.md");

  cachedInstructions = readFileSync(filePath, "utf-8").trim();
  return cachedInstructions;
}
