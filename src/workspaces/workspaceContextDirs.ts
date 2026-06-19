import { app } from "electron";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const WORKSPACE_CONTEXT_SUBDIRS = ["rules", "skills"] as const;

export function isValidWorkspaceDirName(name: string): boolean {
  if (!name || name === "." || name === "..") {
    return false;
  }

  return !name.includes("/") && !name.includes("\\") && !name.includes("\0");
}

function getWorkspaceContextDir(workspaceName: string): string {
  return join(app.getPath("userData"), "workspaces", workspaceName);
}

export function createWorkspaceContextDirs(workspaceName: string): void {
  const workspaceDir = getWorkspaceContextDir(workspaceName);

  for (const subdir of WORKSPACE_CONTEXT_SUBDIRS) {
    mkdirSync(join(workspaceDir, subdir), { recursive: true });
  }
}

export function deleteWorkspaceContextDirs(workspaceName: string): void {
  const workspaceDir = getWorkspaceContextDir(workspaceName);

  if (existsSync(workspaceDir)) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}
