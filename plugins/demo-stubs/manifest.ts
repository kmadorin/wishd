import type { Manifest } from "@wishd/plugin-sdk";

export const manifest: Manifest = {
  name: "demo-stubs",
  version: "0.0.0",
  chains: [11155111, 1, 8453, 42161, 10, 137],
  trust: "unverified",
  provides: {
    intents: ["borrow", "earn", "bridge", "find-vault"],
    widgets: ["borrow-demo", "earn-demo", "bridge-demo"],
    mcps: ["demo_stubs"],
  },
};
