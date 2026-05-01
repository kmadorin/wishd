import type { Manifest } from "@wishd/plugin-sdk";
export const manifest: Manifest = {
  name: "uniswap",
  version: "0.0.0",
  chains: [1, 8453, 42161, 10, 137, 130, 11155111],
  trust: "verified",
  provides: {
    intents: ["uniswap.swap"],
    widgets: ["swap-summary", "swap-execute"],
    mcps: ["uniswap"],
  },
};
