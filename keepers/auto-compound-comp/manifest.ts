import type { KeeperManifest } from "@wishd/plugin-sdk";
import { SEPOLIA_CHAIN_ID } from "./addresses";

export const manifest: KeeperManifest = {
  id: "auto-compound-comp",
  name: "Auto-compound COMP rewards",
  description:
    "Hourly: claim COMP, swap to USDC, supply into your Compound V3 position. Runs via Porto session keys.",
  version: "0.0.1",
  chains: [SEPOLIA_CHAIN_ID],
  plugins: ["compound-v3"],
  trust: "verified",
  appliesTo: [{ intent: "compound-v3.deposit" }, { intent: "compound-v3.lend" }],
};
