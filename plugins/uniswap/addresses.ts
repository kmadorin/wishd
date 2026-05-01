import type { Hex } from "viem";

export const TRADING_API_CHAINS: ReadonlySet<number> = new Set([1, 8453, 42161, 10, 137, 130]);

export const UNIVERSAL_ROUTER: Record<number, Hex> = {
  1:     "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af",
  8453:  "0x6fF5693b99212Da76ad316178A184AB56D299b43",
  42161: "0xA51afAFe0263b40EdaEf0Df8781eA9aa03E381a3",
  10:    "0x851116D9223fabED8E56C0E6b8Ad0c31d98B3507",
  137:   "0x1095692A6237d83C6a72F3F5eFEdb9A670C49223",
  130:   "0xEf740bf23aCaE26f6492B10de645D6B98dC8Eaf3",
};

export const DIRECT_V3_CHAINS: Record<number, {
  quoterV2: Hex;
  swapRouter02: Hex;
  universalRouter?: Hex;
}> = {
  11155111: {
    quoterV2:     "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
    swapRouter02: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
  },
};
