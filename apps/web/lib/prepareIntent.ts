export type PrepareResponse = {
  prepared: unknown;
  widget: { id: string; type: string; slot: "flow"; props: Record<string, unknown> };
};

export class PrepareError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PrepareError";
    this.status = status;
  }
}

export async function prepareIntent(
  intent: string,
  body: Record<string, unknown>,
  init?: { signal?: AbortSignal },
): Promise<PrepareResponse> {
  const t0 = performance.now();
  const res = await fetch(`/api/prepare/${encodeURIComponent(intent)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: init?.signal,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new PrepareError(res.status, msg);
  }
  const out = (await res.json()) as PrepareResponse;
  if (typeof console !== "undefined") {
    console.info(
      JSON.stringify({
        tag: "wishd:perf",
        event: "prepare-roundtrip-ms",
        intent,
        ms: Math.round(performance.now() - t0),
      }),
    );
  }
  return out;
}

import type { RegisteredIntent } from "./intentRegistry.client";
import { isEvmCaip2, isSvmCaip2 } from "@wishd/plugin-sdk";

export type ChainFamily = "evm" | "svm";

export type ResolveCtx = {
  connectedFamilies: ChainFamily[];   // wallets currently connected
  values: Record<string, unknown>;
};

function pickChainField(schema: RegisteredIntent["schema"], primaryKey: string | undefined): string | undefined {
  const chainFields = schema.fields.filter((f) => f.type === "chain");
  if (chainFields.length === 0) return undefined;
  if (primaryKey) {
    const hit = chainFields.find((f) => f.key === primaryKey);
    if (hit) return hit.key;
  }
  if (chainFields.length === 1) return chainFields[0]!.key;
  const named = chainFields.find((f) => /^(from|source)?chain$/i.test(f.key));
  return (named ?? chainFields[0]!).key;
}

function familyOf(caip2: string): ChainFamily | undefined {
  if (isEvmCaip2(caip2)) return "evm";
  if (isSvmCaip2(caip2)) return "svm";
  return undefined;
}

export function resolveClaimant(
  claimants: RegisteredIntent[],
  ctx: ResolveCtx,
  primaryKeyByPlugin: Record<string, string | undefined> = {},
): RegisteredIntent {
  if (claimants.length === 0) throw new Error("no plugin claims this intent");
  if (claimants.length === 1) return claimants[0]!;

  // Determine which families each claimant supports.
  const claimantFamilies = claimants.map((c) => {
    const k = pickChainField(c.schema, primaryKeyByPlugin[c.pluginName]);
    if (!k) return undefined;
    const field = c.schema.fields.find((f) => f.key === k);
    if (!field || !("options" in field) || !Array.isArray(field.options)) return undefined;
    const families = new Set((field.options as string[]).map(familyOf).filter(Boolean));
    return families;
  });

  // If multiple wallet families are connected and claimants span multiple families, refuse to auto-pick.
  if (ctx.connectedFamilies.length > 1) {
    const claimantFamilySet = new Set(
      claimantFamilies.flatMap((s) => (s ? [...s] : [])),
    );
    const matchingConnected = ctx.connectedFamilies.filter((f) => claimantFamilySet.has(f));
    if (matchingConnected.length > 1) {
      throw new Error("ambiguous intent: multiple claimants match connected wallets");
    }
  }

  // Single connected family: filter claimants whose options include the value.
  const candidates = claimants.filter((c) => {
    const k = pickChainField(c.schema, primaryKeyByPlugin[c.pluginName]);
    if (!k) return false;
    const v = ctx.values[k];
    if (typeof v !== "string") return false;
    const fam = familyOf(v);
    if (!fam || !ctx.connectedFamilies.includes(fam)) return false;
    const field = c.schema.fields.find((f) => f.key === k);
    if (field && "options" in field && Array.isArray(field.options)) {
      return (field.options as string[]).includes(v);
    }
    return true;
  });

  if (candidates.length === 0) throw new Error("ambiguous intent: no claimant matches connected wallet family");
  if (candidates.length > 1) throw new Error("ambiguous intent: multiple claimants match connected wallets");
  return candidates[0]!;
}
