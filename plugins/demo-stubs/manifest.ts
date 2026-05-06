import { type Manifest, EIP155 } from "@wishd/plugin-sdk";

export const manifest: Manifest = {
  name: "demo-stubs",
  version: "0.0.0",
  chains: [
    EIP155(11155111), EIP155(1), EIP155(8453),
    EIP155(42161), EIP155(10), EIP155(137),
  ],
  trust: "unverified",
  provides: {
    intents: ["borrow", "earn", "bridge", "find-vault"],
    widgets: ["borrow-demo", "earn-demo", "bridge-demo"],
    mcps: ["demo_stubs"],
  },
};
