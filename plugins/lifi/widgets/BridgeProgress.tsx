"use client";

import { useEffect, useRef } from "react";
import { explorerTxUrl } from "@wishd/plugin-sdk";
import { ExecuteTimeline } from "../../../apps/web/components/primitives/ExecuteTimeline";
import type { ExecStep } from "../../../apps/web/components/primitives/ExecuteTimeline";
import { useBridgeProgressStore } from "../store/bridgeProgressStore";
import { LifiStatusPoller } from "../observe";
import { useEmit } from "@wishd/plugin-sdk";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type BridgeProgressProps = {
  id: string; // source txHash
};

// ---------------------------------------------------------------------------
// Helpers: build timeline steps from status
// ---------------------------------------------------------------------------

type BridgePhase = "pending" | "done" | "failed" | "invalid" | "timeout";

function buildSteps(
  phase: BridgePhase,
  srcTxHash: string,
  srcCaip2: string,
  destTxHash: string | undefined,
  destCaip2: string,
): ExecStep[] {
  const isDone = phase === "done";
  const isFailed = phase === "failed" || phase === "invalid";

  return [
    {
      id: "source-signed",
      title: "Source signed",
      sub: srcTxHash
        ? `tx: ${srcTxHash.slice(0, 10)}…`
        : undefined,
      phase: "done",
      detail: srcTxHash && explorerTxUrl(srcCaip2, srcTxHash) ? (
        <a
          className="text-accent underline font-mono text-xs"
          href={explorerTxUrl(srcCaip2, srcTxHash)}
          target="_blank"
          rel="noreferrer"
        >
          view source tx
        </a>
      ) : undefined,
    },
    {
      id: "source-confirmed",
      title: "Source confirmed",
      phase: "done",
    },
    {
      id: "bridge-processing",
      title: "Bridge processing",
      phase:
        isDone ? "done" :
        isFailed ? "error" :
        "active",
    },
    {
      id: "destination-delivered",
      title: "Destination delivered",
      phase:
        isDone ? "done" :
        isFailed ? "error" :
        "queued",
      detail: isDone && destTxHash && explorerTxUrl(destCaip2, destTxHash) ? (
        <a
          className="text-accent underline font-mono text-xs"
          href={explorerTxUrl(destCaip2, destTxHash)}
          target="_blank"
          rel="noreferrer"
        >
          view destination tx
        </a>
      ) : undefined,
    },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BridgeProgress({ id }: BridgeProgressProps) {
  const record = useBridgeProgressStore((s) => s.records[id]);
  const emit = useEmit();
  const pollerRef = useRef<ReturnType<LifiStatusPoller["start"]> | null>(null);

  useEffect(() => {
    if (!record || record.lastStatus !== "PENDING") return;

    const store = useBridgeProgressStore.getState();
    const poller = new LifiStatusPoller(record.observation, store, emit);
    const ctl = poller.start(id, id);
    pollerRef.current = ctl;

    return () => {
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); // Only re-mount on id change; record/emit are stable refs

  // No record found
  if (!record) {
    return (
      <div className="p-4 text-sm text-ink-3" data-testid="no-bridge-record">
        No bridge in progress
      </div>
    );
  }

  const { lastStatus, config, destTxHash } = record;
  const srcCaip2 = config.fromCaip2;
  const destCaip2 = config.toCaip2;

  // --- DONE ---
  if (lastStatus === "DONE") {
    return (
      <div className="flex flex-col gap-3 p-4 rounded-2xl border border-rule bg-bg">
        <div className="text-sm font-semibold text-good">Bridge complete</div>
        <ExecuteTimeline
          steps={buildSteps("done", id, srcCaip2, destTxHash, destCaip2)}
        />
        <div className="flex flex-col gap-1 text-xs text-ink-3">
          {explorerTxUrl(srcCaip2, id) && (
            <a
              href={explorerTxUrl(srcCaip2, id)}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline"
              data-testid="src-explorer-link"
            >
              View source tx
            </a>
          )}
          {destTxHash && explorerTxUrl(destCaip2, destTxHash) && (
            <a
              href={explorerTxUrl(destCaip2, destTxHash)}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline"
              data-testid="dest-explorer-link"
            >
              View destination tx
            </a>
          )}
        </div>
      </div>
    );
  }

  // --- FAILED / INVALID ---
  if (lastStatus === "FAILED" || lastStatus === "INVALID") {
    const recoveryUrl = `https://li.quest/recovery/${id}`;
    return (
      <div className="flex flex-col gap-3 p-4 rounded-2xl border border-bad bg-bg">
        <div className="text-sm font-semibold text-bad">
          {lastStatus === "INVALID" ? "Bridge invalid — could not locate source tx" : "Bridge failed"}
        </div>
        <ExecuteTimeline
          steps={buildSteps(lastStatus === "FAILED" ? "failed" : "invalid", id, srcCaip2, destTxHash, destCaip2)}
        />
        <a
          href={recoveryUrl}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline text-xs"
          data-testid="recovery-link"
        >
          Recover with Li.Fi
        </a>
      </div>
    );
  }

  // --- TIMEOUT ---
  if (lastStatus === "TIMEOUT") {
    const txUrl = `https://li.quest/tx/${id}`;
    return (
      <div className="flex flex-col gap-3 p-4 rounded-2xl border border-warn bg-bg">
        <div className="text-sm font-semibold text-ink-2">
          Bridge still pending after 15 minutes
        </div>
        <a
          href={txUrl}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline text-xs"
          data-testid="timeout-link"
        >
          View on Li.Fi
        </a>
        <button
          type="button"
          data-testid="resume-polling"
          className="rounded-pill border border-rule px-3 py-1.5 text-xs text-ink-2 hover:text-ink"
          onClick={() => {
            const store = useBridgeProgressStore.getState();
            store.patch(id, { lastStatus: "PENDING" });
          }}
        >
          Resume polling
        </button>
      </div>
    );
  }

  // --- PENDING ---
  return (
    <div className="flex flex-col gap-3 p-4 rounded-2xl border border-rule bg-bg" data-testid="bridge-progress-pending">
      <ExecuteTimeline
        steps={buildSteps("pending", id, srcCaip2, destTxHash, destCaip2)}
      />
    </div>
  );
}
