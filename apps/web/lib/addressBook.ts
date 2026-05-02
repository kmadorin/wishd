import type { Address } from "@wishd/plugin-sdk";
import {
  COMP_SEPOLIA, USDC_SEPOLIA, COMET_USDC_SEPOLIA,
  COMET_REWARDS_SEPOLIA, UNISWAP_ROUTER_SEPOLIA,
} from "@wishd/keeper-auto-compound-comp/addresses";

export type AddressEntry = { label: string; decimals?: number };

const map: Record<string, AddressEntry> = {
  [COMP_SEPOLIA.toLowerCase()]:           { label: "COMP", decimals: 18 },
  [USDC_SEPOLIA.toLowerCase()]:           { label: "USDC", decimals: 6 },
  [COMET_USDC_SEPOLIA.toLowerCase()]:     { label: "Compound · cUSDCv3" },
  [COMET_REWARDS_SEPOLIA.toLowerCase()]:  { label: "Compound · CometRewards" },
  [UNISWAP_ROUTER_SEPOLIA.toLowerCase()]: { label: "Uniswap V3 Router" },
};

export function lookup(addr: Address): AddressEntry | null {
  return map[addr.toLowerCase()] ?? null;
}

export function addressShort(addr: Address): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
