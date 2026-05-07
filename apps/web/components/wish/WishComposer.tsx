"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useWalletConnection } from "@solana/react-hooks";
import { humanizeChain, isSvmCaip2, renderSentenceParts, type IntentField, type IntentSchema } from "@wishd/plugin-sdk";
import { useWorkspace } from "@/store/workspace";
import { startStream } from "./EventStream";
import { StepCard } from "@/components/primitives/StepCard";
import { ActionPill, type ActionPillOption, type ActionPillVariant } from "@/components/primitives/ActionPill";
import {
  SentenceBox,
  SentenceConnector,
  SentencePrefix,
} from "@/components/primitives/SentenceBox";
import { CLIENT_INTENT_SCHEMAS } from "@/lib/intentRegistry.client";
import { prepareIntent, PrepareError } from "@/lib/prepareIntent";
import { AssetPicker } from "./AssetPicker";
import { CHAIN_ID_BY_SLUG, applyAssetChange } from "@plugins/uniswap/intents";
import { FlipButton } from "@/components/primitives/FlipButton";

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

const SKELETON_TIMEOUT_MS = 15000;

function newSkeletonId(): string {
  return `s_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultsFor(schema: IntentSchema): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of schema.fields) out[f.key] = "default" in f && f.default != null ? f.default : "";
  return out;
}

export function WishComposer() {
  const [mode, setMode] = useState<"structured" | "freetext">("structured");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [intentId, setIntentId] = useState("");
  const schema = useMemo(
    () => CLIENT_INTENT_SCHEMAS.find((s) => s.intent === intentId),
    [intentId],
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [openPillKey, setOpenPillKey] = useState<string | null>(null);
  const { address, chainId, isConnected } = useAccount();
  const solana = useWalletConnection();
  const ws = useWorkspace();

  const account = {
    address: (address ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    chainId: chainId ?? 11155111,
  };

  function isSvmIntent(s: IntentSchema): boolean {
    const chainField = s.fields.find((f) => f.type === "chain");
    if (!chainField || !("options" in chainField)) return false;
    const options = chainField.options as string[];
    return options.length > 0 && options.every(isSvmCaip2);
  }

  function buildSubmitBody(s: IntentSchema, vs: Record<string, string>): Record<string, unknown> {
    const swapper = solana.wallet?.account?.address;
    if (isSvmIntent(s)) return { ...vs, swapper, address: account.address };
    // Cross-chain (e.g. lifi.bridge-swap with SVM destination): include both.
    const hasSvmField = s.fields.some(
      (f) => f.type === "chain" && "options" in f && (f.options as string[]).some(isSvmCaip2),
    );
    if (hasSvmField) return { ...vs, swapper, address: account.address, fromAddress: account.address, toAddress: swapper };
    return { ...vs, address: account.address };
  }

  useEffect(() => {
    function closeOnOutsideMouseDown(e: MouseEvent) {
      if (!openPillKey) return;
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('[role="menu"], button[aria-haspopup="menu"]')
      ) {
        return;
      }
      setOpenPillKey(null);
    }

    document.addEventListener("mousedown", closeOnOutsideMouseDown);
    return () => document.removeEventListener("mousedown", closeOnOutsideMouseDown);
  }, [openPillKey]);

  function pickSchema(id: string) {
    const next = CLIENT_INTENT_SCHEMAS.find((s) => s.intent === id);
    setIntentId(id);
    setValues(next ? defaultsFor(next) : {});
    setOpenPillKey(null);
  }

  function setAssetField(side: "in" | "out", next: string) {
    setValues((s) => {
      const prev = { assetIn: s.assetIn ?? "", assetOut: s.assetOut ?? "" };
      const updated = applyAssetChange(side, next, prev);
      return { ...s, assetIn: updated.assetIn, assetOut: updated.assetOut };
    });
  }

  function flipAssets() {
    setValues((s) => ({ ...s, assetIn: s.assetOut ?? "", assetOut: s.assetIn ?? "" }));
  }

  function setField(key: string, v: string) {
    setValues((s) => ({ ...s, [key]: v }));
  }

  async function submitStructuredWith(s: IntentSchema, vs: Record<string, string>) {
    if (!isConnected || !address) {
      ws.reset();
      ws.appendNarration("connect a wallet first — top right.");
      return;
    }
    setBusy(true);
    ws.reset();
    const skeletonId = newSkeletonId();
    ws.appendSkeleton({
      id: skeletonId,
      widgetType: s.widget,
      amount: vs.amount,
      asset: vs.asset,
    });
    console.info(
      JSON.stringify({ tag: "wishd:perf", event: "composer-submit", intent: s.intent, t: Date.now() }),
    );

    void (async () => {
      try {
        await startStream({
          wish: phrase(s, vs),
          account,
          context: { mode: "narrate-only", intent: s.intent, values: vs },
          onEvent: (e) => {
            if (e.type === "tool.call") ws.appendAgentEvent({ kind: "tool.call", name: e.name, input: e.input });
            if (e.type === "chat.delta") {
              ws.appendNarration(e.delta);
              ws.appendAgentEvent({ kind: "delta", text: e.delta });
            }
            if (e.type === "ui.patch") {
              ws.appendAgentEvent({ kind: "ui.patch", widgetId: e.id });
              ws.patchWidget(e.id, e.props);
            }
            if (e.type === "ui.dismiss") {
              ws.appendAgentEvent({ kind: "ui.dismiss", widgetId: e.id });
              ws.dismissWidget(e.id);
            }
            if (e.type === "notification") ws.appendAgentEvent({ kind: "notification", level: e.level, text: e.text });
            if (e.type === "result") ws.appendAgentEvent({ kind: "result", ok: e.ok, cost: e.cost });
            if (e.type === "error") ws.appendAgentEvent({ kind: "error", message: e.message });
            // ignore ui.render in narrate-only mode (server should not emit it)
          },
        });
      } catch {
        // narration is purely additive; surface but don't fail the flow
        ws.appendNarration("\n[narration unavailable]");
      }
    })();

    const t0 = performance.now();
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        ws.failSkeleton(skeletonId, "preparation timed out — retry?");
        reject(new Error("preparation timed out"));
      }, SKELETON_TIMEOUT_MS);
    });

    ws.appendAgentEvent({ kind: "step", label: `prepare ${s.intent}`, status: "start" });
    const tPrepare = performance.now();
    try {
      const out = await Promise.race([
        prepareIntent(s.intent, buildSubmitBody(s, vs), { signal: controller.signal }),
        timeout,
      ]);
      if (timedOut) return;
      ws.appendAgentEvent({ kind: "step", label: `prepare ${s.intent}`, status: "ok", ms: Math.round(performance.now() - tPrepare) });
      ws.appendAgentEvent({ kind: "ui.render", widgetType: out.widget.type, widgetId: out.widget.id });
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
          intent: s.intent,
          ms: Math.round(performance.now() - t0),
        }),
      );
    } catch (err) {
      if (timedOut || (err instanceof Error && err.name === "AbortError")) return;
      const msg =
        err instanceof PrepareError
          ? err.message
          : err instanceof Error
            ? err.message
            : "unknown error";
      ws.appendAgentEvent({ kind: "step", label: `prepare ${s.intent}`, status: "fail", ms: Math.round(performance.now() - tPrepare) });
      ws.failSkeleton(skeletonId, msg);
    } finally {
      if (timer) clearTimeout(timer);
      setBusy(false);
    }
  }

  function submitStructured() {
    if (!schema || hasMissingRequired(schema, values)) return;
    submitStructuredWith(schema, values);
  }

  async function submitFreeText(wish: string) {
    if (!wish.trim()) return;
    if (!isConnected || !address) {
      ws.reset();
      ws.appendNarration("connect a wallet first — top right.");
      return;
    }
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
          if (e.type === "tool.call") ws.appendAgentEvent({ kind: "tool.call", name: e.name, input: e.input });
          if (e.type === "chat.delta") {
            ws.appendNarration(e.delta);
            ws.appendAgentEvent({ kind: "delta", text: e.delta });
          }
          if (e.type === "ui.render") {
            ws.appendAgentEvent({ kind: "ui.render", widgetType: e.widget.type, widgetId: e.widget.id });
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
          if (e.type === "ui.patch") {
            ws.appendAgentEvent({ kind: "ui.patch", widgetId: e.id });
            ws.patchWidget(e.id, e.props);
          }
          if (e.type === "ui.dismiss") {
            ws.appendAgentEvent({ kind: "ui.dismiss", widgetId: e.id });
            ws.dismissWidget(e.id);
          }
          if (e.type === "notification") ws.appendAgentEvent({ kind: "notification", level: e.level, text: e.text });
          if (e.type === "result") ws.appendAgentEvent({ kind: "result", ok: e.ok, cost: e.cost });
          if (e.type === "error") {
            ws.appendAgentEvent({ kind: "error", message: e.message });
            ws.failSkeleton(skeletonId, e.message);
          }
        },
      });
    } finally {
      setBusy(false);
    }
  }

  const missingRequired = !schema || hasMissingRequired(schema, values);

  return (
    <StepCard step="STEP 01" title="describe your wish" sub="pick an action — we pre-fill the rest">
      {mode === "structured" ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitStructured();
            }}
          >
            <SentenceBox>
              <SentencePrefix>I want to</SentencePrefix>
              <ActionPill
                variant="action"
                value={schema?.verb}
                placeholder="pick action"
                ariaLabel="Select action"
                options={(() => {
                  const verbCount = new Map<string, number>();
                  for (const s of CLIENT_INTENT_SCHEMAS) {
                    verbCount.set(s.verb, (verbCount.get(s.verb) ?? 0) + 1);
                  }
                  return CLIENT_INTENT_SCHEMAS.map((s) => {
                    const ambiguous = (verbCount.get(s.verb) ?? 0) > 1;
                    const plugin = s.intent.split(".")[0];
                    return {
                      id: s.intent,
                      label: ambiguous ? `${s.verb} (${plugin})` : s.verb,
                      sub: s.description,
                    };
                  });
                })()}
                open={openPillKey === "action"}
                onOpenChange={(o) => setOpenPillKey(o ? "action" : null)}
                onChange={pickSchema}
                disabled={busy}
              />
              {schema?.fields.length ? (
                renderSentenceParts(schema).map((part, i) => {
                  if (part.kind === "connector") {
                    const parts = renderSentenceParts(schema);
                    const next = parts[i + 1];
                    const showFlip =
                      (schema.intent === "uniswap.swap" || schema.intent === "jupiter.swap") &&
                      next &&
                      next.kind === "field" &&
                      (next as { kind: "field"; key: string }).key === "assetOut";
                    return (
                      <SentenceConnector key={`connector-${i}`}>
                        {part.text}
                        {showFlip && <FlipButton onClick={flipAssets} />}
                      </SentenceConnector>
                    );
                  }

                  const field = schema.fields.find((f) => f.key === part.key);
                  if (!field) return null;
                  const isAssetField = field.type === "asset" && (field.key === "assetIn" || field.key === "assetOut");
                  return (
                    <FieldPill
                      key={field.key}
                      field={field}
                      value={values[field.key] ?? ""}
                      open={openPillKey === field.key}
                      onOpenChange={(o) => setOpenPillKey(o ? field.key : null)}
                      onChange={(v) => {
                        if (isAssetField) {
                          setAssetField(field.key === "assetIn" ? "in" : "out", v);
                        } else {
                          setField(field.key, v);
                        }
                      }}
                      disabled={busy}
                      chainId={CHAIN_ID_BY_SLUG[values.chain ?? ""] ?? CHAIN_ID_BY_SLUG["ethereum-sepolia"]}
                      address={address}
                    />
                  );
                })
              ) : (
                <SentenceConnector>pick an action</SentenceConnector>
              )}
            </SentenceBox>
            <button
              type="submit"
              disabled={busy || missingRequired}
              className="rounded-pill bg-accent text-ink px-4 py-2 font-semibold hover:bg-accent-2 disabled:opacity-50"
            >
              {busy ? "…" : "looks good →"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setMode("freetext")}
            className="mt-3 text-xs text-ink-3 hover:text-ink underline"
          >
            type instead
          </button>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs text-ink-3">or try:</span>
            {CHIPS.map((c) => (
              <button
                key={c.label}
                type="button"
                disabled={busy}
                onClick={() => {
                  setIntentId(c.intent);
                  setValues(c.values);
                  setOpenPillKey(null);
                  const s = CLIENT_INTENT_SCHEMAS.find((x) => x.intent === c.intent);
                  if (s) submitStructuredWith(s, c.values);
                }}
                className="px-3 py-1 rounded-pill text-sm font-medium bg-accent-2 border border-accent text-ink hover:bg-accent disabled:opacity-50"
              >
                {c.label}
              </button>
            ))}
          </div>
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

function FieldPill({
  field,
  value,
  open,
  onOpenChange,
  onChange,
  disabled,
  chainId,
  address,
}: {
  field: IntentField;
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (v: string) => void;
  disabled?: boolean;
  chainId?: number;
  address?: `0x${string}` | string;
}) {
  if (field.type === "amount") {
    return (
      <ActionPill
        variant="amount"
        value={value}
        placeholder="amount"
        ariaLabel="Enter amount"
        onChange={onChange}
        disabled={disabled}
        inputWidthCh={Math.max(4, Math.min(10, value.length || 6))}
      />
    );
  }

  // Asset fields with >1 option (e.g. swap): use registry-driven AssetPicker.
  // Asset fields with exactly 1 option (e.g. Compound USDC-only): keep native ActionPill dropdown.
  if (field.type === "asset" && field.options.length !== 1) {
    return (
      <AssetPicker
        chainId={chainId ?? 11155111}
        value={value}
        onChange={onChange}
        address={address}
        open={open}
        onOpenChange={onOpenChange}
        variant={field.key === "assetOut" ? "to" : "from"}
      />
    );
  }

  const variant = pillVariantFor(field);
  return (
    <ActionPill
      variant={variant}
      value={value}
      placeholder={field.key}
      ariaLabel={ariaLabelForField(field)}
      iconTicker={field.type === "asset" ? value : undefined}
      options={field.options.map((v) => optionForValue(v, field.type))}
      open={open}
      onOpenChange={onOpenChange}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

function pillVariantFor(field: IntentField): ActionPillVariant {
  if (field.type === "amount") return "amount";
  if (field.type === "asset") return "from";
  if (field.type === "select" && field.key.toLowerCase().includes("protocol")) return "protocol";
  if (field.key.toLowerCase().includes("protocol")) return "protocol";
  return "chain";
}

function optionForValue(v: string, fieldType?: IntentField["type"]): ActionPillOption {
  return { id: v, label: labelForValue(v, fieldType) };
}

function labelForValue(v: string, fieldType?: IntentField["type"]): string {
  if (v === "ethereum-sepolia") return "Ethereum Sepolia";
  if (fieldType === "chain" || /^(eip155|solana):/.test(v)) return humanizeChain(v);
  return v;
}

function ariaLabelForField(field: IntentField): string {
  if (field.type === "amount") return "Enter amount";
  if (field.type === "asset") return "Select asset";
  if (field.type === "select" && field.key.toLowerCase().includes("protocol")) return "Select protocol";
  if (field.type === "select") return `Select ${field.key}`;
  if (field.key.toLowerCase().includes("protocol")) return "Select protocol";
  return "Select chain";
}

function hasMissingRequired(schema: IntentSchema, vs: Record<string, string>): boolean {
  return schema.fields.some((f) => f.required && !vs[f.key]);
}

function phrase(schema: IntentSchema, v: Record<string, string>): string {
  if (schema.intent.startsWith("compound-v3.")) {
    const prep = schema.intent === "compound-v3.withdraw" ? "from" : "into";
    return `I want to ${schema.verb} ${v.amount ?? ""} ${v.asset ?? ""} ${prep} Compound on ${labelForValue(v.chain ?? "")}.`;
  }

  const parts = renderSentenceParts(schema).map((part) =>
    part.kind === "connector" ? part.text : labelForValue(v[part.key] ?? ""),
  );
  return `I want to ${schema.verb} ${parts.filter(Boolean).join(" ")}.`;
}

function guessFromText(t: string): { widgetType: string; amount?: string; asset?: string } {
  const lower = t.toLowerCase();
  if (/swap|trade|exchange/.test(lower)) {
    const m = lower.match(/(\d+(?:\.\d+)?)\s*(eth|usdc|usdt|dai|wbtc|matic|weth)?/);
    return { widgetType: "swap-summary", amount: m?.[1], asset: m?.[2]?.toUpperCase() };
  }
  const widgetType = /withdraw|redeem/.test(lower) ? "compound-withdraw-summary" : "compound-summary";
  const m = lower.match(/(\d+(?:\.\d+)?)\s*(usdc|usd|eth)?/);
  return { widgetType, amount: m?.[1], asset: m?.[2]?.toUpperCase() };
}
