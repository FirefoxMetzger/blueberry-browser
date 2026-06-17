import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
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
          contextdashboard: resolve(__dirname, "src/contextDashboard/renderer/index.html"),
        },
      },
    },
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
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
