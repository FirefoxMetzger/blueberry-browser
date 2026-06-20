import { type ToolSet } from "ai";
import * as tabClick from "./tab_click";
import * as tabGoBack from "./tab_go_back";
import * as tabOpen from "./tab_open";
import * as tabRead from "./tab_read";
import * as tabScreenshot from "./tab_screenshot";
import * as tabScroll from "./tab_scroll";
import * as tabType from "./tab_type";
import type { AgentToolContext } from "./types";
import * as workspaceListTabs from "./workspace_list_tabs";
import * as workspaceSearch from "./workspace_search";

const toolModules = [
  workspaceListTabs,
  workspaceSearch,
  tabScreenshot,
  tabRead,
  tabOpen,
  tabScroll,
  tabClick,
  tabGoBack,
  tabType,
] as const;

export function createAgentTools(context: AgentToolContext): ToolSet {
  return Object.fromEntries(
    toolModules.map((mod) => [mod.name, mod.create(context)]),
  ) as ToolSet;
}
