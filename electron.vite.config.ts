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
          preloadTopBar: resolve(__dirname, "src/topBar/preloadTopBar.ts"),
          preloadSideBar: resolve(__dirname, "src/sideBar/preloadSideBar.ts"),
          preloadEventPanel: resolve(
            __dirname,
            "src/eventPanel/preloadEventPanel.ts",
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
          sidebar: resolve(__dirname, "src/sideBar/renderer/index.html"),
          eventpanel: resolve(__dirname, "src/eventPanel/renderer/index.html"),
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
