import { type Manifest, EIP155 } from "@wishd/plugin-sdk";

export const manifest: Manifest = {
  name: "compound-v3",
  version: "0.0.0",
  chains: [EIP155(11155111)],
  trust: "verified",
  provides: {
    intents: ["deposit", "lend", "supply", "withdraw", "redeem"],
    widgets: ["compound-summary", "compound-execute", "compound-withdraw-summary"],
    mcps: ["compound"],
  },
};
