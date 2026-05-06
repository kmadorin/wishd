"use client";

// Blessed re-exports so plugins import from one place.
// Peer dep — not a runtime dep of @wishd/plugin-sdk.
export {
  useSolanaClient,
  useWalletConnection,
  useStake,
  useSolTransfer,
  useWrapSol,
  useSplToken,
  useWallet,
} from "@solana/react-hooks";
