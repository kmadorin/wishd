import type { Address } from "viem";

export const COMPOUND_ADDRESSES: Record<number, {
  USDC: Address;
  Comet: Address;
  CometRewards: Address;
  COMP: Address;
}> = {
  11155111: {
    USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    Comet: "0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e",
    CometRewards: "0x8bF5b658bdF0388E8b482ED51B14aef58f90abfD",
    COMP: "0xA6c8D1c55951e8AC44a0EaA959Be5Fd21cc07531",
  },
};

export const SUPPORTED_CHAINS = [11155111] as const;
