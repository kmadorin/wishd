import type { ReactNode } from "react";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { Providers } from "./providers";
import { getConfig } from "@/lib/wagmi";
import { KeeperDeployFlow } from "@/components/wish/KeeperDeployFlow";
import { WalletDrawer } from "@/components/wish/WalletDrawer";
import "./globals.css";

export const metadata = {
  title: "wishd — defi by wishing it",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const initialState = cookieToInitialState(getConfig(), (await headers()).get("cookie"));
  return (
    <html lang="en">
      <body>
        <Providers initialState={initialState}>
          {children}
          <KeeperDeployFlow />
          <WalletDrawer />
        </Providers>
      </body>
    </html>
  );
}
