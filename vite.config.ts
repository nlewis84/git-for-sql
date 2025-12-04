import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  server: {
    port: 3000,
    // Allow ngrok hosts for webhook testing
    allowedHosts: [
      ".ngrok.io",
      ".ngrok-free.app",
      ".ngrok-free.dev",
      ".ngrok.app",
    ],
  },
});

