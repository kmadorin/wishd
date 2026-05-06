import { vi } from "vitest";
import type { SolanaRpcLike } from "../ctx";

export function mockSolanaRpc(): {
  [K in keyof SolanaRpcLike]: ReturnType<typeof vi.fn>;
} {
  const wrap = <T>(value: T) => ({ send: () => Promise.resolve(value) });
  return {
    getBalance:                  vi.fn(() => wrap({ value: 0n })),
    getBlockHeight:              vi.fn(() => wrap(0n)),
    getSignatureStatuses:        vi.fn(() => wrap({ value: [] })),
    getRecentPrioritizationFees: vi.fn(() => wrap([])),
    sendTransaction:             vi.fn(() => wrap("MOCK_SIG")),
    getTokenAccountBalance:      vi.fn(() => wrap({ value: { amount: "0", decimals: 0 } })),
  } as any;
}
