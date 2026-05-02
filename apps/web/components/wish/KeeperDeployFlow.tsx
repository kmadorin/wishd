"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount } from "wagmi";
import { useGrantPermissions } from "porto/wagmi/Hooks";
import { useKeeperDeploy } from "@/store/keeperDeploy";
import { clientGetKeeper } from "@/lib/keepers/clientRegistry";
import { buildPortoGrantPayload } from "@/lib/keepers/buildPortoGrantPayload";
import type { DelegationProposal } from "@/server/keepers/proposeDelegation";
import type { SpendPeriod, Address, Keeper } from "@wishd/plugin-sdk";
import { lookup, addressShort } from "@/lib/addressBook";

type Phase = "review" | "granting" | "deploying" | "confirmed" | "error";

function humanizeGrantError(raw: string): string {
  if (/Invalid parameters were provided to the RPC method/i.test(raw)) {
    return "Wallet rejected the request — usually a config mismatch in the keeper. Try again, or reach out so we can fix it.";
  }
  if (/User rejected/i.test(raw)) {
    return "You declined the wallet request. Tap retry to try again.";
  }
  return raw;
}

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
      });
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
            <div className="border border-dashed border-ink rounded-md p-3 bg-surface-2 text-sm leading-relaxed">
              <strong className="block text-xs uppercase tracking-wider text-ink-3 mb-1">What this lets us do</strong>
              <p>{keeper.manifest.explainer.whatThisDoes}</p>
              {payload.suggestedDelegation?.rationale && (
                <p className="mt-2 text-ink-3"><em>Agent note:</em> {payload.suggestedDelegation.rationale}</p>
              )}
            </div>

            <Block label="Spend caps · per period">
              {proposal.spend.map((s) => {
                if (keeper.delegation.kind !== "porto-permissions") return null;
                const bound = keeper.delegation.spend.bounds.find((b) => b.token === s.token);
                const tokenLabel =
                  keeper.manifest.explainer.perToken[s.token]?.label
                  ?? lookup(s.token)?.label
                  ?? addressShort(s.token);
                const decimals =
                  keeper.manifest.explainer.perToken[s.token]?.decimals
                  ?? lookup(s.token)?.decimals
                  ?? 18;
                const display = formatUnits(s.limit, decimals);
                const maxDisplay = bound ? formatUnits(bound.maxLimit, decimals) : "—";
                return (
                  <div key={s.token} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-xs">
                    <span>{tokenLabel}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`spend cap ${tokenLabel}`}
                      className="bg-surface-2 border border-rule rounded px-2 py-1 w-28 font-mono text-right"
                      value={display}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^0-9.]/g, "");
                        if (!cleaned) return;
                        let parsed: bigint;
                        try { parsed = parseUnits(cleaned as `${number}`, decimals); }
                        catch { return; }
                        const max = bound?.maxLimit ?? parsed;
                        setSpendLimit(s.token, parsed > max ? max : parsed);
                      }}
                    />
                    <select
                      className="bg-surface-2 border border-rule rounded px-2 py-1 text-xs"
                      value={s.period}
                      onChange={(ev) => setSpendPeriod(s.token, ev.target.value as SpendPeriod)}
                    >
                      {(bound?.periods ?? ["month"]).map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <span className="col-span-3 text-[10px] font-mono text-ink-3 text-right">max {maxDisplay}/{s.period}</span>
                  </div>
                );
              })}
              {keeper.manifest.explainer.recommendedSpendRationale && (
                <p className="text-[11px] italic text-ink-3 mt-1">{keeper.manifest.explainer.recommendedSpendRationale}</p>
              )}
            </Block>

            <Block label="Expiry">
              {keeper.delegation.kind === "porto-permissions" && keeper.delegation.expiryPolicy.kind === "unlimited" && (
                <span className="text-xs">no expiry · revoke anytime in your Porto wallet</span>
              )}
              {keeper.delegation.kind === "porto-permissions" && keeper.delegation.expiryPolicy.kind === "fixed" && (
                <span className="text-xs">{keeper.delegation.expiryPolicy.days} days (fixed)</span>
              )}
              {keeper.delegation.kind === "porto-permissions" && keeper.delegation.expiryPolicy.kind === "bounded" && (
                <span className="text-xs">up to {keeper.delegation.expiryPolicy.maxDays} days</span>
              )}
            </Block>

            <CallsAccordion keeper={keeper} />

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
            <p className="text-sm text-warn mb-2">{humanizeGrantError(errorMsg ?? "unknown error")}</p>
            <details className="text-[11px] text-ink-3 mb-2">
              <summary>technical details</summary>
              <pre className="whitespace-pre-wrap break-words">{errorMsg ?? ""}</pre>
            </details>
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

function CallsAccordion(props: { keeper: Keeper }): ReactElement | null {
  const [open, setOpen] = useState(false);
  if (props.keeper.delegation.kind !== "porto-permissions") return null;
  const calls = props.keeper.delegation.fixed.calls;
  return (
    <div className="border-t border-rule pt-2">
      <button
        type="button"
        className="w-full flex justify-between items-center font-mono text-[10px] tracking-[0.12em] uppercase text-ink-3"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>Allowed contract calls ({calls.length})</span>
        <span>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5 text-xs">
          {calls.map((c) => {
            const e = props.keeper.manifest.explainer.perCall[c.to] ?? {
              label: lookup(c.to)?.label ?? addressShort(c.to),
              purpose: c.signature,
            };
            return (
              <li key={c.to} className="grid grid-cols-[1fr_auto] gap-2">
                <div>
                  <strong>{e.label}</strong>
                  <span className="text-ink-3"> — {e.purpose}</span>
                </div>
                <span className="font-mono text-[10px] text-ink-3">{addressShort(c.to)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
