import { type Manifest, EIP155 } from "@wishd/plugin-sdk";

export const manifest: Manifest = {
  name: "uniswap",
  version: "0.0.0",
  chains: [
    EIP155(1), EIP155(8453), EIP155(42161), EIP155(10),
    EIP155(137), EIP155(130), EIP155(11155111),
  ],
  trust: "verified",
  provides: {
    intents: ["uniswap.swap"],
    widgets: ["swap-summary", "swap-execute"],
    mcps: ["uniswap"],
  },
};
