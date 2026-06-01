import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";

let apiPort = 3000;
try {
  apiPort = parseInt(fs.readFileSync(".port", "utf-8").trim());
} catch {}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
