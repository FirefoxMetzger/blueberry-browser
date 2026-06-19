import { resolve } from "path";
import { copyFileSync } from "node:fs";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

function copyAgentInstructions(): Plugin {
  return {
    name: "copy-agent-instructions",
    closeBundle() {
      copyFileSync(
        resolve(__dirname, "src/agentChat/instructions.md"),
        resolve(__dirname, "out/main/instructions.md"),
      );
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyAgentInstructions()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          topBar: resolve(__dirname, "src/topBar/preload.ts"),
          agentChat: resolve(__dirname, "src/agentChat/preload.ts"),
          contextDashboard: resolve(
            __dirname,
            "src/contextDashboard/preload.ts",
          ),
        },
      },
    },
  },
  renderer: {
    root: "src",
    build: {
      rollupOptions: {
        input: {
          topbar: resolve(__dirname, "src/topBar/renderer/index.html"),
          agentchat: resolve(__dirname, "src/agentChat/renderer/index.html"),
          contextdashboard: resolve(
            __dirname,
            "src/contextDashboard/renderer/index.html",
          ),
        },
      },
    },
    resolve: {
      alias: {
        "@darkMode": resolve("src/darkMode"),
      },
    },
    plugins: [react()],
    server: {
      fs: {
        allow: [".."],
      },
    },
  },
});
