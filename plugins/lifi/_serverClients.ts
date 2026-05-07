/**
 * _serverClients.ts — thin dependency-injection shim for server-side clients.
 *
 * Defines the ServerDeps interface + a `defaultDeps` stub that throws unless
 * real implementations are injected by the consumer (MCP server or apps/web).
 *
 * Plugin tests mock deps inline. The MCP server wires real impls from
 * apps/web/server/lifiClients. This keeps the plugin package decoupled from apps/web.
 */

import type { LiFiFetchOptions } from "../../apps/web/server/lifiClients";

export type LifiFetchFn = (path: string, options: LiFiFetchOptions) => Promise<unknown>;
export type EvmPublicClientForFn = (caip2: string) => { readContract: (...args: any[]) => Promise<any> };

export type ServerDeps = {
  lifiFetch: LifiFetchFn;
  evmPublicClientFor: EvmPublicClientForFn;
};

function stubLifiFetch(): never {
  throw new Error(
    "lifiFetch not injected. Pass deps={ lifiFetch, evmPublicClientFor } when calling prepareBridgeSwap.",
  );
}

function stubEvmPublicClientFor(): never {
  throw new Error(
    "evmPublicClientFor not injected. Pass deps={ lifiFetch, evmPublicClientFor } when calling prepareBridgeSwap.",
  );
}

/**
 * Default stubs — throw at call time.
 * Consumers (MCP server, apps/web route handlers) must inject real implementations.
 */
export const defaultDeps: ServerDeps = {
  lifiFetch: stubLifiFetch as unknown as LifiFetchFn,
  evmPublicClientFor: stubEvmPublicClientFor as unknown as EvmPublicClientForFn,
};
