import type { Address } from "@wishd/plugin-sdk";
import { buildCaip10, EIP155 } from "@wishd/plugin-sdk";
import {
  COMP_SEPOLIA, USDC_SEPOLIA, COMET_USDC_SEPOLIA,
  COMET_REWARDS_SEPOLIA, UNISWAP_ROUTER_SEPOLIA,
} from "@wishd/keeper-auto-compound-comp/addresses";

export type AddressEntry = { label: string; decimals?: number };

// Default chain for hex-shim lookups (Sepolia testnet).
const DEFAULT_CAIP2 = EIP155(11155111);

// Map keyed by CAIP-10 identifier for canonical lookups.
const caip10Map: Record<string, AddressEntry> = {
  [buildCaip10(DEFAULT_CAIP2, COMP_SEPOLIA.toLowerCase())]:           { label: "COMP", decimals: 18 },
  [buildCaip10(DEFAULT_CAIP2, USDC_SEPOLIA.toLowerCase())]:           { label: "USDC", decimals: 6 },
  [buildCaip10(DEFAULT_CAIP2, COMET_USDC_SEPOLIA.toLowerCase())]:     { label: "Compound · cUSDCv3" },
  [buildCaip10(DEFAULT_CAIP2, COMET_REWARDS_SEPOLIA.toLowerCase())]:  { label: "Compound · CometRewards" },
  [buildCaip10(DEFAULT_CAIP2, UNISWAP_ROUTER_SEPOLIA.toLowerCase())]: { label: "Uniswap V3 Router" },
};

/** Look up an entry by its CAIP-10 identifier (e.g. "eip155:11155111:0xabc…"). */
export function lookupCaip10(caip10: string): AddressEntry | null {
  return caip10Map[caip10] ?? null;
}

/**
 * Hex-address shim — looks up by address on the default chain (Sepolia).
 * Kept for backward compatibility with existing callers.
 * @param addr   EVM hex address (checksummed or lowercase).
 * @param caip2  CAIP-2 chain namespace (default: eip155:11155111).
 */
export function lookup(addr: Address, caip2: string = DEFAULT_CAIP2): AddressEntry | null {
  return lookupCaip10(buildCaip10(caip2, addr.toLowerCase()));
}

// Regex to detect a hex Ethereum address.
const HEX_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Shorten an address for display.
 * - EVM hex (0x…40 hex chars): "0xAAAA…BBBB" (first 6 + last 4 chars)
 * - Base58 (Solana / other):   "AAAAAAA…BBBBBB" (first 6 + last 5 chars)
 */
export function addressShort(addr: string): string {
  if (HEX_RE.test(addr)) {
    // "0xAAAA" = 6 chars, "BBBB" = last 4
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  }
  // Base58 — show first 6, last 5
  return `${addr.slice(0, 6)}…${addr.slice(-5)}`;
}
