"use client";

import { useEffect, useRef, useState } from "react";
import { explorerTxUrl, SOLANA_MAINNET, type SvmTxCall } from "@wishd/plugin-sdk";
import { useSolanaClient, useWalletSession } from "@wishd/plugin-sdk/svm/react";
import { callPluginTool } from "@wishd/plugin-sdk/routes";
import { createWalletTransactionSigner } from "@solana/client";
import { getTransactionDecoder } from "@solana/transactions";
import { SuccessCard } from "../../../apps/web/components/primitives/SuccessCard";
import { WidgetCard } from "../../../apps/web/components/primitives/WidgetCard";
import type { JupiterSwapPrepared } from "../types";

type Phase = "connect" | "ready" | "preflight" | "submitting" | "confirmed" | "error";

export type JupiterSwapExecuteProps = {
  id: string;
  prepared: JupiterSwapPrepared;
};

function isSvmTxCall(c: unknown): c is SvmTxCall {
  return (
    typeof c === "object" &&
    c !== null &&
    (c as { family?: string }).family === "svm" &&
    (c as { kind?: string }).kind === "tx"
  );
}

function decodeBase64Tx(b64: string) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return getTransactionDecoder().decode(bytes);
}

async function waitForConfirmation(
  rpc: { getSignatureStatuses: (sigs: string[]) => { send: () => Promise<{ value: Array<{ confirmationStatus?: string } | null> }> }; getBlockHeight: () => { send: () => Promise<bigint> } },
  signature: string,
  lastValidBlockHeight: bigint,
): Promise<void> {
  for (;;) {
    const [statuses, height] = await Promise.all([
      rpc.getSignatureStatuses([signature]).send(),
      rpc.getBlockHeight().send(),
    ]);
    const s = statuses.value[0];
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return;
    if (height > lastValidBlockHeight) throw new Error("transaction expired");
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export function JupiterSwapExecute({ id, prepared }: JupiterSwapExecuteProps) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<SvmTxCall | null>(
    prepared.calls.find(isSvmTxCall) ?? null,
  );
  const ranRef = useRef(false);

  const client = useSolanaClient() as unknown as {
    rpc: {
      getSignatureStatuses: (sigs: string[]) => { send: () => Promise<{ value: Array<{ confirmationStatus?: string } | null> }> };
      getBlockHeight: () => { send: () => Promise<bigint> };
      sendTransaction: (tx: Uint8Array | string) => { send: () => Promise<string> };
    };
  };
  const session = useWalletSession();

  async function execute() {
    setError(null);
    try {
      if (!session) {
        setPhase("connect");
        return;
      }
      // session.chain may be a CAIP-2 like "solana:mainnet" — normalize to mainnet check
      const sessionChain = (session as unknown as { chain?: string }).chain;
      if (sessionChain && sessionChain !== SOLANA_MAINNET) {
        setError("switch to Solana mainnet");
        setPhase("error");
        return;
      }

      let call = activeCall;
      if (!call || !isSvmTxCall(call)) {
        setError("no executable Solana transaction in prepared");
        setPhase("error");
        return;
      }

      if (Date.now() > (call.staleAfter ?? 0)) {
        setPhase("preflight");
        const refreshed = await callPluginTool<JupiterSwapPrepared>(
          "jupiter",
          "refresh_swap",
          { config: prepared.config, summaryId: id },
        );
        const next = refreshed.calls.find(isSvmTxCall);
        if (!next) throw new Error("refresh returned no executable call");
        call = next;
        setActiveCall(call);
      }

      setPhase("submitting");
      const tx = decodeBase64Tx(call.base64);
      const result = createWalletTransactionSigner(session as never) as unknown as
        | { mode: "send"; signer: { signAndSendTransactions: (txs: unknown[]) => Promise<unknown[]> } }
        | { mode: "partial"; signer: { signTransactions: (txs: unknown[]) => Promise<unknown[]> } };
      let sig: string;
      if (result.mode === "send") {
        const [raw] = await result.signer.signAndSendTransactions([tx]);
        sig = raw as string;
      } else {
        const [signed] = await result.signer.signTransactions([tx]);
        sig = await client.rpc.sendTransaction(signed as never).send();
      }
      setSignature(sig);

      await waitForConfirmation(client.rpc, sig, call.lastValidBlockHeight);
      setPhase("confirmed");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    void execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "confirmed" && signature) {
    const url = explorerTxUrl(SOLANA_MAINNET, signature);
    return (
      <SuccessCard
        title="Swap confirmed"
        sub={`${prepared.config.assetIn} → ${prepared.config.assetOut}`}
        summary={[
          { k: "Signature", v: <a href={url} target="_blank" rel="noreferrer" className="font-mono text-xs underline">{signature.slice(0, 8)}…{signature.slice(-8)}</a> },
        ]}
      />
    );
  }

  return (
    <WidgetCard>
      <div className="flex flex-col gap-2 p-4">
        <div className="text-sm text-neutral-500">
          {prepared.config.assetIn} → {prepared.config.assetOut} on Solana
        </div>
        <div className="text-sm">
          {phase === "connect" && "Connect a Solana wallet to continue."}
          {phase === "ready" && "Preparing…"}
          {phase === "preflight" && "Refreshing quote…"}
          {phase === "submitting" && "Awaiting wallet signature…"}
          {phase === "error" && (
            <span className="text-red-600">{error ?? "Unknown error"}</span>
          )}
        </div>
        {phase === "error" && (
          <button
            type="button"
            onClick={() => {
              ranRef.current = false;
              void execute();
            }}
            className="self-start rounded-md bg-blue-600 px-3 py-1 text-sm text-white"
          >
            Retry
          </button>
        )}
      </div>
    </WidgetCard>
  );
}
