import { type Manifest, SOLANA_MAINNET } from "@wishd/plugin-sdk";

export const manifest: Manifest = {
  name: "jupiter",
  version: "0.0.0",
  chains: [SOLANA_MAINNET],
  trust: "verified",
  provides: {
    intents: ["jupiter.swap"],
    widgets: ["jupiter-swap-summary", "jupiter-swap-execute"],
    mcps: ["jupiter"],
  },
};
