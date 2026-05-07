// plugins/lifi/refresh.ts
// refreshBridgeSwap — re-quote using a previously-validated LifiBridgeConfig.
// Shares quoteAndBuild with prepareBridgeSwap (DRY).

import { quoteAndBuild } from "./prepare";
import { defaultDeps } from "./_serverClients";
import type { ServerDeps } from "./_serverClients";
import type { LifiBridgeConfig, LifiBridgePrepared } from "./types";

export type RefreshBridgeSwapInput = {
  config: LifiBridgeConfig;
};

/**
 * Re-run the Li.Fi quote + allowance check for a previously-validated config.
 * Skips resolveAsset and validateBridgeValues — those were done in prepare.
 *
 * @param input - contains the cached LifiBridgeConfig
 * @param deps - server dependencies (same interface as prepareBridgeSwap)
 */
export async function refreshBridgeSwap(
  input: RefreshBridgeSwapInput,
  deps: ServerDeps = defaultDeps,
): Promise<LifiBridgePrepared> {
  return quoteAndBuild(input.config, deps);
}
