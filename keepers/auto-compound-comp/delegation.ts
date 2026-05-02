import type { DelegationSpec } from "@wishd/plugin-sdk";
import {
  COMP_SEPOLIA, USDC_SEPOLIA, COMET_USDC_SEPOLIA,
  COMET_REWARDS_SEPOLIA, UNISWAP_ROUTER_SEPOLIA,
  COMP_DECIMALS, USDC_DECIMALS,
} from "./addresses";

const tenPow = (n: number) => 10n ** BigInt(n);

export const delegation: DelegationSpec = {
  kind: "porto-permissions",
  fixed: {
    calls: [
      { to: COMET_REWARDS_SEPOLIA, signature: "claim(address,address,bool)" },
      { to: COMP_SEPOLIA,          signature: "approve(address,uint256)" },
      { to: UNISWAP_ROUTER_SEPOLIA, signature:
          "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))" },
      { to: USDC_SEPOLIA,          signature: "approve(address,uint256)" },
      { to: COMET_USDC_SEPOLIA,    signature: "supply(address,uint256)" },
    ],
    feeToken: { symbol: "ETH", limit: "0.05" },
  },
  expiryPolicy: { kind: "unlimited" },
  spend: {
    bounds: [
      { token: COMP_SEPOLIA, maxLimit: 1000n * tenPow(COMP_DECIMALS), periods: ["week", "month"] },
      { token: USDC_SEPOLIA, maxLimit: 10000n * tenPow(USDC_DECIMALS), periods: ["week", "month"] },
    ],
    defaults: [
      { token: COMP_SEPOLIA, limit: 100n * tenPow(COMP_DECIMALS), period: "month" },
      { token: USDC_SEPOLIA, limit: 1000n * tenPow(USDC_DECIMALS), period: "month" },
    ],
  },
};
