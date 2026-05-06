"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useSwitchChain,
  useSendCalls,
  useWaitForCallsStatus,
  useConnectors,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type { ExecStep } from "../../../apps/web/components/primitives/ExecuteTimeline";
import { ExecuteTimeline } from "../../../apps/web/components/primitives/ExecuteTimeline";
import { SuccessCard } from "../../../apps/web/components/primitives/SuccessCard";
import { useWorkspace } from "../../../apps/web/store/workspace";
import { validateCall } from "../strategies/validateCall";
import type { SwapConfig, SwapQuote, Call, StrategyCall, KeeperOffer } from "../types";

// ---------------------------------------------------------------------------
// Inline helpers (mirrors SwapSummary to avoid cross-package circular import)
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Phase
// ---------------------------------------------------------------------------

type Phase =
  | "connect"
  | "switch-chain"
  | "ready"
  | "preflight"
  | "submitting"
  | "confirmed"
  | "error";

// ---------------------------------------------------------------------------
// Props — mirrors SwapSummary's prepared shape
// ---------------------------------------------------------------------------

export type SwapExecuteProps = {
  config: SwapConfig;
  initialQuote: SwapQuote;
  initialQuoteAt: number;
  approvalCall: Call | null;
  balance: string;
  insufficient: boolean;
  liquidityNote?: string;
  keeperOffers: KeeperOffer[];
  /** summaryId ties this execute to the same queryKey as SwapSummary */
  summaryId?: string;
};

// ---------------------------------------------------------------------------
// mapSwapExec — build ExecStep[] from phase
// ---------------------------------------------------------------------------

function mapSwapExec(opts: {
  phase: Phase;
  approvalCall: Call | null;
  txHash?: string;
  errMsg?: string;
  assetIn: string;
}): ExecStep[] {
  const { phase, approvalCall, txHash, errMsg, assetIn } = opts;

  // stage cursor
  const stage =
    phase === "connect" || phase === "switch-chain" ? 0 :
    phase === "ready" ? 0 :
    phase === "preflight" ? 1 :
    phase === "submitting" ? (approvalCall ? 3 : 3) :
    phase === "confirmed" ? 5 :
    /* error */ -1;

  type Raw = Omit<ExecStep, "phase"> & { stage: number };
  const raw: Raw[] = [
    {
      id: "preflight",
      title: "pre-flight quote",
      sub: "fetching fresh quote",
      stage: 1,
    },
  ];

  if (approvalCall) {
    raw.push({
      id: "approve",
      title: `approve ${assetIn}`,
      sub: "ERC-20 allowance",
      stage: 2,
    });
  }

  raw.push({
    id: "sign",
    title: "sign swap",
    sub: "wallet prompt",
    stage: 3,
  });

  raw.push({
    id: "broadcast",
    title: "broadcasting",
    sub: "confirm on-chain",
    detail: txHash ? (
      <a
        className="text-accent underline font-mono text-xs"
        href={`https://etherscan.io/tx/${txHash}`}
        target="_blank"
        rel="noreferrer"
      >
        {txHash.slice(0, 10)}…{txHash.slice(-8)}
      </a>
    ) : undefined,
    stage: 4,
  });

  raw.push({
    id: "confirmed",
    title: "confirmed",
    sub: "swap complete",
    stage: 5,
  });

  const steps: ExecStep[] = raw.map((s) => ({
    id: s.id,
    title: s.title,
    sub: s.sub,
    detail: s.detail,
    phase:
      s.stage < stage ? "done" :
      s.stage === stage ? "active" :
      "queued",
  }));

  // Error overlay — mark the first non-done step as error
  if (phase === "error" && errMsg) {
    const firstActive = steps.findIndex((s) => s.phase === "active" || s.phase === "queued");
    return steps.map((s, i) =>
      i === firstActive
        ? { ...s, phase: "error", detail: <span className="text-bad text-xs">{errMsg}</span> }
        : s,
    );
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SwapExecute(props: SwapExecuteProps) {
  const { config, initialQuote, approvalCall, keeperOffers } = props;
  const { chainId: configChainId, swapper, tokenIn, tokenOut, assetIn, assetOut, slippageBps } = config;

  const { isConnected, chainId } = useAccount();
  const connectors = useConnectors();
  const portoConnector = connectors[0];
  const { connect } = useConnect();
  const { switchChain } = useSwitchChain();
  const {
    sendCalls,
    data: sendData,
    error: sendError,
    isPending: sendPending,
    reset: resetSend,
  } = useSendCalls();
  const callsStatus = useWaitForCallsStatus({ id: sendData?.id });
  const queryClient = useQueryClient();
  const resetWorkspace = useWorkspace((s) => s.reset);

  const [phase, setPhase] = useState<Phase>("ready");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  // Track whether approval was needed for timeline rendering after submission
  const [approvalNeeded, setApprovalNeeded] = useState<boolean>(!!approvalCall);

  // --------------------------------------------------------------------------
  // Phase state machine (mirrors CompoundExecute, adds preflight)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isConnected) {
      setPhase("connect");
      return;
    }
    if (chainId !== configChainId) {
      setPhase("switch-chain");
      return;
    }
    if (callsStatus.data?.status === "success") {
      setPhase("confirmed");
      return;
    }
    if (callsStatus.data?.status === "failure") {
      setPhase("error");
      setErrMsg("transaction failed on-chain");
      return;
    }
    if (sendPending || (sendData?.id && callsStatus.isLoading)) {
      setPhase("submitting");
      return;
    }
    if (sendError) {
      logSendError(sendError, config);
      setPhase("error");
      setErrMsg(friendlyError(sendError));
      return;
    }
    // Don't reset to ready if we're in preflight — that's managed by onClick
    if (phase !== "preflight") {
      setPhase("ready");
    }
  }, [
    isConnected,
    chainId,
    configChainId,
    sendPending,
    sendError,
    sendData?.id,
    callsStatus.data?.status,
    callsStatus.isLoading,
    phase,
  ]);

  // --------------------------------------------------------------------------
  // onClick handler
  // --------------------------------------------------------------------------

  async function onClick() {
    setErrMsg(null);

    if (phase === "connect" && portoConnector) {
      connect({ connector: portoConnector });
      return;
    }
    if (phase === "switch-chain") {
      switchChain({ chainId: configChainId as number });
      return;
    }
    if (phase !== "ready" && phase !== "error") return;

    resetSend();
    setPhase("preflight");

    try {
      // Step 1: fresh quote via queryClient.fetchQuery (cancel-bypass)
      const amountIn = props.initialQuote.amountIn;
      const freshQuote = await queryClient.fetchQuery<SwapQuote>({
        queryKey: [
          "uniswap.quote",
          configChainId,
          tokenIn,
          tokenOut,
          amountIn,
          swapper,
          slippageBps,
          assetIn,
          assetOut,
        ],
        queryFn: async () => {
          const r = await fetch("/api/uniswap/quote", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chainId: configChainId,
              tokenIn,
              tokenOut,
              amountIn,
              swapper,
              slippageBps,
              assetIn,
              assetOut,
            }),
          });
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new HttpError(r.status, (body as { error?: string }).error ?? r.statusText);
          }
          return r.json() as Promise<SwapQuote>;
        },
        staleTime: 0,
      });

      // Step 2: POST /api/uniswap/swap
      const swapRes = await fetch("/api/uniswap/swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config, quote: freshQuote }),
      });
      if (!swapRes.ok) {
        const body = await swapRes.json().catch(() => ({}));
        throw new HttpError(swapRes.status, (body as { error?: string }).error ?? swapRes.statusText);
      }
      const { swapCall, approvalStillRequired } = (await swapRes.json()) as {
        swapCall: Partial<StrategyCall>;
        approvalStillRequired: boolean;
      };

      // Step 3: validate swapCall
      validateCall(swapCall, "swapCall");

      // Step 4: build calls array
      const needsApproval = approvalStillRequired;
      setApprovalNeeded(needsApproval);

      if (needsApproval && !approvalCall) {
        throw new Error("approval required but no approvalCall was provided — re-prepare swap");
      }

      const calls = needsApproval
        ? [approvalCall!, swapCall]
        : [swapCall];

      // Step 5: submit
      console.info(
        JSON.stringify({
          tag: "wishd:exec",
          event: "sendCalls-attempt",
          kind: "swap",
          chainId: configChainId,
          user: swapper,
          callCount: calls.length,
          calls: calls.map((c) => ({
            to: c.to,
            value: c.value,
            dataLen: c.data.length,
            selector: c.data.slice(0, 10),
          })),
          assetIn,
          assetOut,
          amountIn,
          needsApproval,
          t: Date.now(),
        }),
      );

      setPhase("submitting");
      sendCalls({ calls: calls as any });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error("wishd:exec swap preflight-error", e);
      setPhase("error");
      setErrMsg(friendlyError(e));
    }
  }

  // --------------------------------------------------------------------------
  // Render — confirmed → SuccessCard
  // --------------------------------------------------------------------------

  const txHash =
    callsStatus.data?.receipts?.[callsStatus.data.receipts.length - 1]?.transactionHash;

  if (phase === "confirmed" && txHash) {
    return (
      <SuccessCard
        title="swap complete ✦"
        sub={`swapped ${props.initialQuote.amountIn} ${assetIn} → ${assetOut}`}
        summary={[
          { k: "you paid", v: `${props.initialQuote.amountIn} ${assetIn}` },
          { k: "you received", v: `~${props.initialQuote.amountOut} ${assetOut}` },
          { k: "chain", v: String(configChainId) },
          {
            k: "tx",
            v: (
              <a
                className="underline"
                target="_blank"
                rel="noreferrer"
                href={`https://etherscan.io/tx/${txHash}`}
              >
                {txHash.slice(0, 10)}…{txHash.slice(-8)}
              </a>
            ),
          },
        ]}
        primaryAction={{
          label: "make another wish",
          onClick: () => resetWorkspace(),
        }}
        secondaryAction={{
          label: "view portfolio",
          onClick: () => alert("portfolio coming soon"),
        }}
      />
    );
  }

  // --------------------------------------------------------------------------
  // Render — timeline
  // --------------------------------------------------------------------------

  const steps = mapSwapExec({
    phase,
    approvalCall: approvalNeeded ? approvalCall : null,
    txHash,
    errMsg: errMsg ?? undefined,
    assetIn,
  });

  const ctaLabel = (() => {
    switch (phase) {
      case "connect": return "Connect Wallet";
      case "switch-chain": return "Switch Network";
      case "ready": return approvalCall ? "Approve & Swap" : "Swap";
      case "preflight": return "Fetching Quote…";
      case "submitting": return "Submitting…";
      case "error": return "Retry";
      default: return "Execute";
    }
  })();

  const ctaDisabled = phase === "preflight" || phase === "submitting";

  return (
    <div>
      <ExecuteTimeline
        steps={steps}
        cta={{ label: ctaLabel, onClick, disabled: ctaDisabled }}
      />
      {phase === "error" && errMsg && (
        <p className="mt-2 text-xs text-bad break-all">{errMsg}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function logSendError(err: unknown, config: SwapConfig): void {
  const e = err as Record<string, unknown> & Error;
  const cause = e.cause as (Record<string, unknown> & Error) | undefined;
  const causeCause = cause?.cause as (Record<string, unknown> & Error) | undefined;
  const summary = {
    tag: "wishd:exec",
    event: "sendCalls-error",
    kind: "swap",
    chainId: config.chainId,
    user: config.swapper,
    name: e?.name,
    code: (e as { code?: number | string })?.code,
    shortMessage: (e as { shortMessage?: string })?.shortMessage,
    message: e?.message,
    details: (e as { details?: string })?.details,
    metaMessages: (e as { metaMessages?: unknown })?.metaMessages,
    docsPath: (e as { docsPath?: string })?.docsPath,
    cause: cause
      ? {
          name: cause.name,
          code: (cause as { code?: number | string }).code,
          shortMessage: (cause as { shortMessage?: string }).shortMessage,
          message: cause.message,
          details: (cause as { details?: string }).details,
        }
      : null,
    causeCause: causeCause
      ? { name: causeCause.name, code: (causeCause as { code?: number | string }).code, message: causeCause.message }
      : null,
    keys: Object.keys(e ?? {}),
    t: Date.now(),
  };
  console.error("wishd:exec sendCalls-error", summary, err);
  try {
    console.error("wishd:exec sendCalls-error JSON", JSON.stringify(summary));
  } catch {
    /* circular */
  }
}

function friendlyError(err: Error): string {
  const msg = err.message ?? String(err);
  const code = (err as { code?: number }).code;
  const name = err.name ?? "";
  if (
    code === 4001 ||
    /user rejected|user denied|rejected the request/i.test(msg) ||
    /UserRejected/.test(name)
  ) {
    return "you cancelled the wallet prompt — click retry to try again";
  }
  if (/insufficient funds|insufficient balance/i.test(msg)) {
    return "insufficient ETH for gas — fund this wallet and retry";
  }
  return msg.length > 200 ? msg.slice(0, 200) + "…" : msg;
}
