import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  root: "src",
  publicDir: "../public",
  server: {
    port: 8788,
    strictPort: true,
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./src/index.html", import.meta.url)),
        setup: fileURLToPath(new URL("./src/setup.html", import.meta.url)),
      },
    },
  },
});
