/**
 * observe.ts — LifiStatusPoller + fetchLifiStatus helper
 *
 * Polls Li.Fi /status with exponential backoff:
 *   initial 3 000ms, factor 1.5, cap 15 000ms, 15-min total timeout.
 *
 * Emits ServerEvents via the injected `emit` callback (PR1 useEmit shape).
 * Terminal states: DONE, FAILED, INVALID, TIMEOUT.
 */

import { defaultDeps } from "./_serverClients";
import type { LifiStatusObservation, LifiBridgeStatus } from "./types";
import type { Emit, ServerEvent } from "@wishd/plugin-sdk";

export type BridgeProgressStoreApi = {
  upsert: (r: any) => void;
  patch: (id: string, p: Partial<{
    lastStatus: LifiBridgeStatus;
    destTxHash?: string;
    toAmountActual?: string;
    lastError?: string;
  }>) => void;
};

export type FetchLifiStatusArgs = {
  txHash: string | number;
  fromChain: string | number;
  toChain: string | number;
  /** Optional lifiFetch override (defaults to defaultDeps.lifiFetch). */
  _lifiFetch?: typeof defaultDeps.lifiFetch;
};

const DEFAULTS = {
  initial: 3_000,
  factor: 1.5,
  maxBackoff: 15_000,
  timeoutMs: 15 * 60 * 1000,
} as const;

/**
 * Thin wrapper around lifiFetch("/status", ...) — used directly by MCP tool.
 * Accepts an optional `_lifiFetch` dep for testability.
 */
export async function fetchLifiStatus(args: FetchLifiStatusArgs): Promise<unknown> {
  const fetch = args._lifiFetch ?? defaultDeps.lifiFetch;
  return fetch("/status", {
    search: {
      txHash: args.txHash as string | number,
      fromChain: args.fromChain as string | number,
      toChain: args.toChain as string | number,
    },
  });
}

export class LifiStatusPoller {
  private done = false;

  constructor(
    private obs: LifiStatusObservation,
    private store: BridgeProgressStoreApi,
    private emit: Emit,
  ) {}

  /**
   * Start polling. Returns an AbortController; caller must call `.abort()` on unmount.
   */
  start(id: string, srcTxHash: string): AbortController {
    const ctl = new AbortController();
    const initial = this.obs.pollMs?.initial ?? DEFAULTS.initial;
    const factor = this.obs.pollMs?.factor ?? DEFAULTS.factor;
    const maxBackoff = this.obs.pollMs?.maxBackoff ?? DEFAULTS.maxBackoff;
    const timeoutAt = Date.now() + (this.obs.timeoutMs ?? DEFAULTS.timeoutMs);

    let delay = initial;
    this.done = false;

    const tick = async () => {
      if (ctl.signal.aborted || this.done) return;

      // Timeout check
      if (Date.now() >= timeoutAt) {
        this.terminal(id, srcTxHash, "TIMEOUT", null);
        return;
      }

      let res: any;
      try {
        res = await fetchLifiStatus({
          txHash: srcTxHash,
          fromChain: this.obs.query.fromChain,
          toChain: this.obs.query.toChain,
        });
      } catch {
        // Network error — apply backoff and retry
        if (!ctl.signal.aborted && !this.done) {
          delay = Math.min(delay * factor, maxBackoff);
          setTimeout(tick, delay);
        }
        return;
      }

      if (ctl.signal.aborted || this.done) return;

      const status: string = res?.status ?? "PENDING";

      if (status === "DONE") {
        this.terminal(id, srcTxHash, "DONE", res);
        return;
      }

      if (status === "FAILED") {
        this.terminal(id, srcTxHash, "FAILED", res);
        return;
      }

      if (status === "INVALID") {
        this.terminal(id, srcTxHash, "INVALID", res);
        return;
      }

      // Still PENDING (or unrecognised status)
      const substatus: string | undefined = res?.substatus;
      const elapsedMs = Date.now() - (timeoutAt - (this.obs.timeoutMs ?? DEFAULTS.timeoutMs));

      const notif: ServerEvent = {
        type: "notification",
        level: "info",
        text: `Bridging… Waiting on destination delivery (status: ${substatus ?? "PENDING"})`,
        // widgetUpdate shape as per plan spec:
        widgetUpdate: {
          id,
          props: { phase: "pending", elapsedMs, lastChecked: Date.now(), substatus: substatus ?? "PENDING" },
        },
      } as any; // ServerEvent union does not include widgetUpdate in current PR1 shape — attach as extra field

      this.emit(notif);
      this.store.patch(id, { lastStatus: "PENDING" });

      delay = Math.min(delay * factor, maxBackoff);
      setTimeout(tick, delay);
    };

    // Schedule first tick after initial delay
    setTimeout(tick, delay);

    return ctl;
  }

  private terminal(id: string, srcTxHash: string, status: LifiBridgeStatus, raw: any): void {
    if (this.done) return;
    this.done = true;

    if (status === "DONE") {
      const destTxHash: string | undefined = raw?.receiving?.txHash;
      const toAmountActual: string | undefined = raw?.receiving?.amount;
      const destCaip2 = String(this.obs.query.toChain);
      const srcCaip2 = String(this.obs.query.fromChain).startsWith("eip155:")
        ? String(this.obs.query.fromChain)
        : `eip155:${this.obs.query.fromChain}`;

      this.store.patch(id, { lastStatus: "DONE", destTxHash, toAmountActual });

      const resultEvent: ServerEvent = {
        type: "result",
        ok: true,
        summary: `Bridge complete. Received ${toAmountActual ?? "tokens"} on destination chain.`,
        artifacts: [
          { kind: "tx", caip2: srcCaip2, hash: srcTxHash },
          ...(destTxHash ? [{ kind: "tx" as const, caip2: destCaip2, hash: destTxHash }] : []),
        ],
      };
      this.emit(resultEvent);
      return;
    }

    if (status === "FAILED") {
      this.store.patch(id, { lastStatus: "FAILED", lastError: raw?.substatus });
      const resultEvent: ServerEvent = {
        type: "result",
        ok: false,
        summary: `Bridge failed: ${raw?.substatus ?? "BRIDGE_REVERTED"}`,
        recovery: {
          kind: "link",
          url: `https://li.quest/recovery/${srcTxHash}`,
          label: "Recover with Li.Fi",
        },
      };
      this.emit(resultEvent);
      return;
    }

    if (status === "INVALID") {
      this.store.patch(id, { lastStatus: "INVALID" });
      const resultEvent: ServerEvent = {
        type: "result",
        ok: false,
        summary: `Bridge invalid: Li.Fi could not locate the source tx. Please check the chain selection.`,
        recovery: {
          kind: "link",
          url: `https://li.quest/recovery/${srcTxHash}`,
          label: "Check with Li.Fi",
        },
      };
      this.emit(resultEvent);
      return;
    }

    // TIMEOUT
    this.store.patch(id, { lastStatus: "TIMEOUT" });
    const resultEvent: ServerEvent = {
      type: "result",
      ok: false,
      summary: `Bridge still pending after 15 minutes. Check Li.Fi for progress.`,
      recovery: {
        kind: "link",
        url: `https://li.quest/tx/${srcTxHash}`,
        label: "View on Li.Fi",
      },
    };
    this.emit(resultEvent);
  }
}
