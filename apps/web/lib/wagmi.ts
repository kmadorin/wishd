import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { porto } from "porto/wagmi";

type Config = ReturnType<typeof createConfig>;

let cached: Config | undefined;

export function getConfig(): Config {
  if (cached) return cached;
  cached = createConfig({
    chains: [sepolia],
    connectors: [porto()],
    multiInjectedProviderDiscovery: false,
    storage: createStorage({ storage: cookieStorage }),
    transports: {
      [sepolia.id]: http(),
    },
    ssr: true,
  });
  return cached;
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
