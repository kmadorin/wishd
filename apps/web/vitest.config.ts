import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@plugins": path.resolve(__dirname, "../../plugins"),
      "@keepers": path.resolve(__dirname, "../../keepers"),
      "@wishd/tokens": path.resolve(__dirname, "../../packages/wishd-tokens/src/index.ts"),
      "@tanstack/react-query": path.resolve(__dirname, "node_modules/@tanstack/react-query/build/modern/index.js"),
      "@wishd/plugin-sdk/routes": path.resolve(__dirname, "../../packages/plugin-sdk/src/routes.ts"),
      "@wishd/plugin-sdk": path.resolve(__dirname, "../../packages/plugin-sdk/src/index.ts"),
      "@wishd/keeper-auto-compound-comp/addresses": path.resolve(__dirname, "../../keepers/auto-compound-comp/addresses.ts"),
      "@wishd/keeper-auto-compound-comp": path.resolve(__dirname, "../../keepers/auto-compound-comp/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
