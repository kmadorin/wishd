"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useWorkspace } from "@/store/workspace";
import { startStream } from "./EventStream";
import { StepCard } from "@/components/primitives/StepCard";
import { StructuredComposer, type StructuredSubmit } from "./StructuredComposer";
import { CLIENT_INTENT_SCHEMAS } from "@/lib/intentRegistry.client";
import { prepareIntent, PrepareError } from "@/lib/prepareIntent";

const CHIPS: Array<{ label: string; intent: string; values: Record<string, string> }> = [
  {
    label: "deposit 10 USDC into Compound on Sepolia",
    intent: "compound-v3.deposit",
    values: { amount: "10", asset: "USDC", chain: "ethereum-sepolia" },
  },
  {
    label: "withdraw 10 USDC from Compound on Sepolia",
    intent: "compound-v3.withdraw",
    values: { amount: "10", asset: "USDC", chain: "ethereum-sepolia" },
  },
];

const SKELETON_TIMEOUT_MS = 5000;

function newSkeletonId(): string {
  return `s_${Math.random().toString(36).slice(2, 10)}`;
}

export function WishComposer() {
  const [mode, setMode] = useState<"structured" | "freetext">("structured");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { address, chainId } = useAccount();
  const ws = useWorkspace();

  const account = {
    address: (address ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    chainId: chainId ?? 11155111,
  };

  async function submitComposer({ intent, values }: StructuredSubmit) {
    setBusy(true);
    ws.reset();
    const skeletonId = newSkeletonId();
    const schema = CLIENT_INTENT_SCHEMAS.find((s) => s.intent === intent);
    ws.appendSkeleton({
      id: skeletonId,
      widgetType: schema?.widget ?? "compound-summary",
      amount: values.amount,
      asset: values.asset,
    });
    console.info(
      JSON.stringify({ tag: "wishd:perf", event: "composer-submit", intent, t: Date.now() }),
    );

    const t0 = performance.now();
    const timer = setTimeout(() => {
      ws.failSkeleton(skeletonId, "preparation timed out — retry?");
    }, SKELETON_TIMEOUT_MS);

    const fastPath = (async () => {
      try {
        const out = await prepareIntent(intent, { ...values, address: account.address });
        clearTimeout(timer);
        ws.hydrateSkeleton(skeletonId, {
          id: out.widget.id,
          type: out.widget.type,
          slot: out.widget.slot,
          props: out.widget.props,
        });
        console.info(
          JSON.stringify({
            tag: "wishd:perf",
            event: "skeleton-to-hydrate-ms",
            intent,
            ms: Math.round(performance.now() - t0),
          }),
        );
      } catch (err) {
        clearTimeout(timer);
        const msg =
          err instanceof PrepareError
            ? err.message
            : err instanceof Error
              ? err.message
              : "unknown error";
        ws.failSkeleton(skeletonId, msg);
      }
    })();

    const narration = (async () => {
      try {
        await startStream({
          wish: phrase(intent, values),
          account,
          context: { mode: "narrate-only", intent, values },
          onEvent: (e) => {
            if (e.type === "chat.delta") ws.appendNarration(e.delta);
            if (e.type === "ui.patch") ws.patchWidget(e.id, e.props);
            if (e.type === "ui.dismiss") ws.dismissWidget(e.id);
            // ignore ui.render in narrate-only mode (server should not emit it)
          },
        });
      } catch {
        // narration is purely additive; surface but don't fail the flow
        ws.appendNarration("\n[narration unavailable]");
      }
    })();

    await Promise.allSettled([fastPath, narration]);
    setBusy(false);
  }

  async function submitFreeText(wish: string) {
    if (!wish.trim()) return;
    setBusy(true);
    ws.reset();
    const skeletonId = newSkeletonId();
    const guess = guessFromText(wish);
    ws.appendSkeleton({
      id: skeletonId,
      widgetType: guess.widgetType,
      amount: guess.amount,
      asset: guess.asset,
    });
    console.info(JSON.stringify({ tag: "wishd:perf", event: "freetext-submit", t: Date.now() }));

    const t0 = performance.now();
    try {
      await startStream({
        wish,
        account,
        onEvent: (e) => {
          if (e.type === "chat.delta") ws.appendNarration(e.delta);
          if (e.type === "ui.render") {
            ws.hydrateSkeleton(skeletonId, {
              id: e.widget.id,
              type: e.widget.type,
              slot: e.widget.slot ?? "flow",
              props: e.widget.props as Record<string, unknown>,
            });
            console.info(
              JSON.stringify({
                tag: "wishd:perf",
                event: "freetext-roundtrip-ms",
                ms: Math.round(performance.now() - t0),
              }),
            );
          }
          if (e.type === "ui.patch") ws.patchWidget(e.id, e.props);
          if (e.type === "ui.dismiss") ws.dismissWidget(e.id);
          if (e.type === "error") ws.failSkeleton(skeletonId, e.message);
        },
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepCard step="STEP 01" title="describe your wish" sub="pick an action — we pre-fill the rest">
      {mode === "structured" ? (
        <>
          <StructuredComposer schemas={CLIENT_INTENT_SCHEMAS} onSubmit={submitComposer} busy={busy} />
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs text-ink-3">or try:</span>
            {CHIPS.map((c) => (
              <button
                key={c.label}
                type="button"
                disabled={busy}
                onClick={() => submitComposer({ intent: c.intent, values: c.values })}
                className="px-3 py-1 rounded-pill text-sm font-medium bg-accent-2 border border-accent text-ink hover:bg-accent disabled:opacity-50"
              >
                {c.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMode("freetext")}
            className="mt-3 text-xs text-ink-3 hover:text-ink underline"
          >
            type instead
          </button>
        </>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitFreeText(text);
            }}
            className="flex gap-2"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="deposit 10 USDC into Compound on Sepolia"
              className="flex-1 rounded-sm bg-surface-2 border border-rule px-3 py-2 font-sans text-ink placeholder:text-ink-3"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-pill bg-accent text-ink px-4 py-2 font-semibold hover:bg-accent-2 disabled:opacity-50"
            >
              {busy ? "…" : "wish"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setMode("structured")}
            className="mt-3 text-xs text-ink-3 hover:text-ink underline"
          >
            use structured composer
          </button>
        </>
      )}
    </StepCard>
  );
}

function phrase(intent: string, v: Record<string, string>): string {
  const verb = intent === "compound-v3.withdraw" ? "withdraw" : "deposit";
  const prep = intent === "compound-v3.withdraw" ? "from" : "into";
  return `I want to ${verb} ${v.amount} ${v.asset} ${prep} Compound on Sepolia.`;
}

function guessFromText(t: string): { widgetType: string; amount?: string; asset?: string } {
  const lower = t.toLowerCase();
  const widgetType = /withdraw|redeem/.test(lower) ? "compound-withdraw-summary" : "compound-summary";
  const m = lower.match(/(\d+(?:\.\d+)?)\s*(usdc|usd|eth)?/);
  return { widgetType, amount: m?.[1], asset: m?.[2]?.toUpperCase() };
}
