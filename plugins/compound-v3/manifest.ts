import type { Manifest } from "@wishd/plugin-sdk";

export const manifest: Manifest = {
  name: "compound-v3",
  version: "0.0.0",
  chains: [11155111],
  trust: "verified",
  provides: {
    intents: ["deposit", "lend", "supply"],
    widgets: ["compound-summary", "compound-execute"],
    mcps: ["compound"],
  },
};
