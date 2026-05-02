import type { KeeperManifest } from "@wishd/plugin-sdk";
import {
  SEPOLIA_CHAIN_ID,
  COMP_SEPOLIA,
  USDC_SEPOLIA,
  COMET_USDC_SEPOLIA,
  COMET_REWARDS_SEPOLIA,
  UNISWAP_ROUTER_SEPOLIA,
  COMP_DECIMALS,
  USDC_DECIMALS,
} from "./addresses";

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
  explainer: {
    whatThisDoes:
      "Every hour, an agent with your session key claims your COMP rewards, swaps them to USDC on Uniswap, and adds them to your Compound deposit. You don't sign each time.",
    perCall: {
      [COMET_REWARDS_SEPOLIA]: { label: "Compound · CometRewards", purpose: "claim accrued COMP" },
      [COMP_SEPOLIA]:          { label: "COMP",                    purpose: "approve Uniswap to swap" },
      [UNISWAP_ROUTER_SEPOLIA]:{ label: "Uniswap V3 Router",        purpose: "swap COMP → USDC" },
      [USDC_SEPOLIA]:          { label: "USDC",                    purpose: "approve Compound to supply" },
      [COMET_USDC_SEPOLIA]:    { label: "Compound · cUSDCv3",      purpose: "supply USDC into your position" },
    },
    perToken: {
      [COMP_SEPOLIA]: { label: "COMP", decimals: COMP_DECIMALS },
      [USDC_SEPOLIA]: { label: "USDC", decimals: USDC_DECIMALS },
    },
    recommendedSpendRationale:
      "Defaults are sized for typical retail positions. Lower if your deposit is smaller; the keeper will simply skip swaps that would exceed the cap.",
  },
};
