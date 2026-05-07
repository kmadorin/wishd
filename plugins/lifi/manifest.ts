import type { Manifest } from "@wishd/plugin-sdk";
import { ALL_CHAINS } from "./addresses";

export const lifiManifest: Manifest = {
  name: "lifi",
  version: "0.0.0",
  chains: [...ALL_CHAINS],
  trust: "verified",
  primaryChainField: "fromChain",
  provides: {
    intents: ["lifi.bridge-swap"],
    widgets: ["lifi-bridge-summary", "lifi-bridge-execute", "lifi-bridge-progress"],
    mcps: ["lifi"],
  },
};
