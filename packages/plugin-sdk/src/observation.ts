export type Placeholder =
  | { from: "callResult"; index: number; field: "hash" | "signature" };

export type LifiStatusObservation = {
  family: "lifi-status";
  endpoint: string;
  query: {
    txHash: string | Placeholder;
    fromChain: string | number;
    toChain:   string | number;
    bridge?: string;
  };
  successWhen: { path: string; equals: string };
  failureWhen: { path: string; equalsAny: string[] };
  pollMs?: { initial: number; maxBackoff: number; factor: number };
  timeoutMs?: number;
  display: { title: string; fromLabel: string; toLabel: string };
};

// Union grows in PR3+: EvmEventLogObservation, SvmAccountWatchObservation, etc.
export type Observation = LifiStatusObservation;

export function isPlaceholder(v: unknown): v is Placeholder {
  return !!v && typeof v === "object" && (v as any).from === "callResult";
}
