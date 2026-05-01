import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@plugins": path.resolve(__dirname, "../../plugins"),
      "@keepers": path.resolve(__dirname, "../../keepers"),
      "@wishd/tokens": path.resolve(__dirname, "../../packages/wishd-tokens/src/index.ts"),
      "@tanstack/react-query": path.resolve(__dirname, "node_modules/@tanstack/react-query/build/modern/index.js"),
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
  },
});
