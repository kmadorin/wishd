import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { porto } from "porto/wagmi";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [porto()],
  transports: {
    [sepolia.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
