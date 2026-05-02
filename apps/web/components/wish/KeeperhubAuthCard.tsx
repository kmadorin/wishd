"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReactElement } from "react";
import { useAccount } from "wagmi";

type Props = {
  stepCardId?: string;
  intent?: string;
  userPortoAddress?: string;
};

type Phase = "idle" | "pending" | "success" | "error";

export function KeeperhubAuthCard({ stepCardId, intent, userPortoAddress }: Props): ReactElement {
  const { address } = useAccount();
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.data?.type === "wishd:kh:authed") {
        setPhase("success");
        // Re-trigger agent flow E with confirmation context
        const account = address ?? userPortoAddress;
        window.dispatchEvent(
          new CustomEvent("wishd:wish", {
            detail: {
              wish: "intent confirmed: keeper auth complete",
              account,
              context: {
                intent,
                confirmed: true,
                userPortoAddress: userPortoAddress ?? account,
                stepCardId,
              },
            },
          }),
        );
      } else if (event.data?.type === "wishd:kh:auth-error") {
        setPhase("error");
        setErrorMsg(event.data.error ?? "authorization failed");
      }
    },
    [address, intent, userPortoAddress, stepCardId],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  async function handleConnect(): Promise<void> {
    setPhase("pending");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/keepers/kh-auth/start", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `request failed ${res.status}`);
      }
      const { authUrl } = (await res.json()) as { authUrl: string; state: string };
      window.open(authUrl, "_blank", "width=600,height=720");
      // Phase stays "pending" until postMessage arrives
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  return (
    <div className="bg-surface rounded-md border border-rule p-4 space-y-3 max-w-sm">
      <header>
        <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-3">keeper hub</div>
        <h2 className="font-hand text-xl font-bold leading-tight">Connect KeeperHub</h2>
      </header>

      <p className="text-xs text-ink-3">
        KeeperHub will be granted <strong>mcp:write</strong> access to create and manage automated keeper
        workflows on your behalf. You can revoke access at any time from your KeeperHub settings.
      </p>

      {phase === "idle" && (
        <button
          type="button"
          className="bg-accent border-[1.5px] border-ink rounded-pill px-4 py-1.5 text-sm font-semibold"
          onClick={handleConnect}
        >
          Connect KeeperHub
        </button>
      )}

      {phase === "pending" && (
        <p className="text-xs text-ink-3">Waiting for authorization in the pop-up window…</p>
      )}

      {phase === "success" && (
        <p className="text-xs text-green-600 font-semibold">KeeperHub connected. Retrying your request…</p>
      )}

      {phase === "error" && (
        <div className="space-y-2">
          <p className="text-xs text-warn">{errorMsg ?? "unknown error"}</p>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => { setPhase("idle"); setErrorMsg(null); }}
          >
            try again
          </button>
        </div>
      )}
    </div>
  );
}
