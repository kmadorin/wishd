import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { porto } from "porto/wagmi";

export function getConfig() {
  return createConfig({
    chains: [sepolia],
    connectors: [porto()],
    multiInjectedProviderDiscovery: false,
    storage: createStorage({ storage: cookieStorage }),
    transports: {
      [sepolia.id]: http(),
    },
    ssr: true,
  });
}

export const wagmiConfig = getConfig();

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
