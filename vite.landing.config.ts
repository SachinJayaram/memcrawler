import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root,
	plugins: [react()],
	resolve: {
		alias: {
			"@desktop": path.resolve(root, "apps/desktop/src"),
		},
	},
	server: {
		fs: {
			allow: [root],
		},
	},
	build: {
		outDir: "dist-landing",
		emptyOutDir: true,
	},
});
