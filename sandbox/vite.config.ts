import { defineConfig } from "vite";

const apiTarget = process.env.API_URL || "http://app:3000";

export default defineConfig({
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
