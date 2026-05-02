import type { Address } from "viem";

// Compound V3 Sepolia
export const COMET_USDC_SEPOLIA: Address = "0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e";
export const COMET_REWARDS_SEPOLIA: Address = "0x8bF5b658bdF0388E8b482ED51B14aef58f90abfD";

// Tokens (Sepolia)
export const COMP_SEPOLIA: Address = "0xA6c8D1c55951e8AC44a0EaA959Be5Fd21cc07531";
export const USDC_SEPOLIA: Address = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

// Uniswap V3 SwapRouter (Sepolia)
export const UNISWAP_ROUTER_SEPOLIA: Address = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";

export const SEPOLIA_CHAIN_ID = 11155111 as const;

// Decimals for unit conversion in delegation defaults/bounds
export const COMP_DECIMALS = 18;
export const USDC_DECIMALS = 6;
