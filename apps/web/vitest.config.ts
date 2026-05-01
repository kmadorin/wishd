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
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
  },
});
