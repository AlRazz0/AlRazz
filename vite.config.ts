import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  plugins: [react(), cloudflare()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: {
      deny: [
        "**/.env*",
        "**/.git/**",
        "**/*.{crt,pem}",
        "**/.dev.vars*",
        "**/.admin-*",
        "**/.wrangler/**",
      ],
    },
  },
  build: { chunkSizeWarningLimit: 700 },
});
