import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

/** Unpacked extension lives at repo root `dist/extension` (Chrome: load that folder). */
const extensionOutDir = resolve(__dirname, "../../dist/extension");

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
    outDir: extensionOutDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "index.html"),
        options: resolve(__dirname, "options.html"),
        background: resolve(__dirname, "src/background/index.ts"),
        chatgpt: resolve(__dirname, "src/content/chatgpt.ts"),
        claude: resolve(__dirname, "src/content/claude.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          const n = chunkInfo.name ?? "";
          if (n === "background") return "background.js";
          if (n === "chatgpt") return "content/chatgpt.js";
          if (n === "claude") return "content/claude.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  publicDir: "public",
});
