"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { useAccount } from "wagmi";
import { useGrantPermissions } from "porto/wagmi/Hooks";
import { useKeeperDeploy } from "@/store/keeperDeploy";
import { clientGetKeeper } from "@/lib/keepers/clientRegistry";
import { buildPortoGrantPayload } from "@/lib/keepers/buildPortoGrantPayload";
import type { DelegationProposal } from "@/server/keepers/proposeDelegation";
import type { SpendPeriod, Address } from "@wishd/plugin-sdk";

type Phase = "review" | "granting" | "deploying" | "confirmed" | "error";

export function KeeperDeployFlow(): ReactElement | null {
  const { open, payload, close } = useKeeperDeploy();
  const { address } = useAccount();
  const [phase, setPhase] = useState<Phase>("review");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [proposal, setProposal] = useState<DelegationProposal | null>(null);
  const grant = useGrantPermissions();

  const keeper = useMemo(() => (payload ? clientGetKeeper(payload.offer.keeperId) : null), [payload]);

  useEffect(() => {
    if (!open) {
      setPhase("review");
      setErrorMsg(null);
      setProposal(null);
      return;
    }
    if (!keeper) return;
    if (keeper.delegation.kind !== "porto-permissions") return;
    setProposal(
      payload?.suggestedDelegation ?? {
        expiry: keeper.delegation.expiryPolicy,
        spend: keeper.delegation.spend.defaults.map((d) => ({ token: d.token, limit: d.limit, period: d.period })),
      },
    );
  }, [open, keeper, payload]);

  if (!open || !payload || !keeper || !proposal) return null;
  if (keeper.delegation.kind !== "porto-permissions") return null;

  async function handleContinue(): Promise<void> {
    if (!address) {
      setErrorMsg("connect a Porto wallet first");
      setPhase("error");
      return;
    }
    setPhase("granting");
    try {
      const sessionKey = ("0x" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "")).slice(0, 42) as Address;
      // TODO(P1+): replace placeholder with Porto-issued session key.
      const params = buildPortoGrantPayload({
        keeper: keeper!,
        proposal: proposal!,
        sessionPublicKey: sessionKey,
      });
      const result = await grant.mutateAsync({
        chainId: 11155111 as 11155111,
        ...params,
      } as Parameters<typeof grant.mutateAsync>[0]);
      const permissionsId = result.id as `0x${string}`;

      setPhase("deploying");
      const res = await fetch("/api/keepers/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          keeperId: keeper!.manifest.id,
          userPortoAddress: address,
          permissionsId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `deploy failed ${res.status}`);
      }
      setPhase("confirmed");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  function setSpendLimit(token: Address, limit: bigint): void {
    setProposal((p) => p && { ...p, spend: p.spend.map((s) => (s.token === token ? { ...s, limit } : s)) });
  }
  function setSpendPeriod(token: Address, period: SpendPeriod): void {
    setProposal((p) => p && { ...p, spend: p.spend.map((s) => (s.token === token ? { ...s, period } : s)) });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="bg-surface w-full max-w-md rounded-md border border-rule p-5">
        <header className="flex items-start justify-between mb-3">
          <div>
            <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-3">deploy keeper</div>
            <h2 className="font-hand text-2xl font-bold leading-tight">{keeper.manifest.name}</h2>
            <p className="text-xs text-ink-3 mt-1">{keeper.manifest.description}</p>
          </div>
          <button type="button" className="text-ink-3 text-sm" onClick={close}>×</button>
        </header>

        {phase === "review" && (
          <section className="space-y-3">
            <Block label="this session may call">
              <ul className="text-xs space-y-1">
                {keeper.delegation.fixed.calls.map((c) => (
                  <li key={c.to} className="font-mono">{c.to} <span className="text-ink-3">{c.signature}</span></li>
                ))}
              </ul>
            </Block>
            <Block label="expiry">
              {keeper.delegation.expiryPolicy.kind === "unlimited" && (
                <span className="text-xs">no expiry · revoke anytime in your Porto wallet</span>
              )}
              {keeper.delegation.expiryPolicy.kind === "fixed" && (
                <span className="text-xs">{keeper.delegation.expiryPolicy.days} days (fixed)</span>
              )}
              {keeper.delegation.expiryPolicy.kind === "bounded" && (
                <span className="text-xs">up to {keeper.delegation.expiryPolicy.maxDays} days</span>
              )}
            </Block>
            <Block label="spend caps">
              {proposal.spend.map((s) => {
                const bound = keeper.delegation.kind === "porto-permissions"
                  ? keeper.delegation.spend.bounds.find((b) => b.token === s.token)
                  : undefined;
                return (
                  <div key={s.token} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-xs">
                    <span className="font-mono">{s.token.slice(0, 10)}…</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="bg-surface-2 border border-rule rounded px-2 py-1 w-28 font-mono"
                      value={s.limit.toString()}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, "");
                        if (!v) return;
                        const n = BigInt(v);
                        const max = bound?.maxLimit ?? n;
                        setSpendLimit(s.token, n > max ? max : n);
                      }}
                    />
                    <select
                      className="bg-surface-2 border border-rule rounded px-2 py-1 text-xs"
                      value={s.period}
                      onChange={(e) => setSpendPeriod(s.token, e.target.value as SpendPeriod)}
                    >
                      {(bound?.periods ?? ["month"]).map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </Block>
            {payload.suggestedDelegation?.rationale && (
              <p className="text-xs text-ink-3 italic">agent suggested: {payload.suggestedDelegation.rationale}</p>
            )}
            <button
              type="button"
              className="bg-accent border-[1.5px] border-ink rounded-pill px-4 py-1.5 text-sm font-semibold"
              onClick={handleContinue}
            >Continue →</button>
          </section>
        )}

        {phase === "granting" && <p className="text-sm">Approve in your Porto wallet…</p>}
        {phase === "deploying" && <p className="text-sm">Creating workflow on KeeperHub…</p>}
        {phase === "confirmed" && (
          <section>
            <p className="text-sm font-bold mb-2">auto-compound active ✓</p>
            <button type="button" className="text-xs underline" onClick={close}>close</button>
          </section>
        )}
        {phase === "error" && (
          <section>
            <p className="text-sm text-warn mb-2">{errorMsg ?? "unknown error"}</p>
            <button type="button" className="text-xs underline" onClick={() => setPhase("review")}>back</button>
          </section>
        )}
      </div>
    </div>
  );
}

function Block(props: { label: string; children: React.ReactNode }): ReactElement {
  return (
    <div className="border-t border-rule pt-2">
      <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-3 mb-1">{props.label}</div>
      {props.children}
    </div>
  );
}
