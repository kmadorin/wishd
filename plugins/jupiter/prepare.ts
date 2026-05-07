import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import type { SolanaRpcLike } from "@wishd/plugin-sdk";
import { resolveAsset, type ResolvedAsset } from "./resolveAsset";
import { validateSwapValues } from "./intents";
import type {
  JupiterSwapConfig,
  JupiterSwapPrepared,
  JupiterSwapQuote,
} from "./types";

const QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
const SWAP_URL = "https://lite-api.jup.ag/swap/v1/swap";
const STALE_AFTER_MS = 25_000;

export type PrepareInput = {
  values: Record<string, string>;
  swapper: string;
  rpc: SolanaRpcLike;
};

function parseUnits(value: string, decimals: number): bigint {
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(value)) throw new Error(`invalid amount: ${value}`);
  const [whole, frac = ""] = value.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole + fracPadded);
}

function formatUnits(atoms: bigint, decimals: number): string {
  const s = atoms.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals) || "0";
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

function slippageToBps(slippage: string): { bps: number; dynamic: boolean } {
  if (slippage === "auto") return { bps: 50, dynamic: true };
  const m = /^([\d.]+)%$/.exec(slippage);
  if (!m) return { bps: 50, dynamic: false };
  return { bps: Math.round(parseFloat(m[1]!) * 100), dynamic: false };
}

async function fetchQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps: number;
  dynamicSlippage: boolean;
}): Promise<JupiterSwapQuote> {
  const qs = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount.toString(),
    slippageBps: String(params.slippageBps),
  });
  if (params.dynamicSlippage) qs.set("dynamicSlippage", "true");
  const url = `${QUOTE_URL}?${qs.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`jupiter quote failed: ${res.status}`);
  return (await res.json()) as JupiterSwapQuote;
}

async function fetchSwap(params: {
  quote: JupiterSwapQuote;
  swapper: string;
}): Promise<{ swapTransaction: string; lastValidBlockHeight: number }> {
  const body = {
    quoteResponse: params.quote,
    userPublicKey: params.swapper,
    wrapAndUnwrapSol: true,
    prioritizationFeeLamports: {
      priorityLevelWithMaxLamports: { maxLamports: 5_000_000, priorityLevel: "high" },
    },
    dynamicComputeUnitLimit: true,
  };
  const res = await fetch(SWAP_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`jupiter swap failed: ${res.status}`);
  return (await res.json()) as { swapTransaction: string; lastValidBlockHeight: number };
}

async function readBalance(
  rpc: SolanaRpcLike,
  swapper: string,
  asset: ResolvedAsset,
): Promise<string> {
  if (asset.isNative) {
    const r = await rpc.getBalance(swapper).send();
    return formatUnits(r.value, 9);
  }
  try {
    const [ata] = await findAssociatedTokenPda({
      owner: swapper as never,
      mint: asset.mint as never,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const r = await rpc.getTokenAccountBalance(ata as unknown as string).send();
    return formatUnits(BigInt(r.value.amount), r.value.decimals);
  } catch {
    return "0";
  }
}

export async function prepareSwap(input: PrepareInput): Promise<JupiterSwapPrepared> {
  const { values, swapper, rpc } = input;
  const v = validateSwapValues(values);
  if (!v.ok) throw new Error(v.error);

  const caip2 = values.chain!;
  const slippage = values.slippage ?? "0.5%";
  const { bps, dynamic } = slippageToBps(slippage);

  const [assetIn, assetOut] = await Promise.all([
    resolveAsset(caip2, values.assetIn!),
    resolveAsset(caip2, values.assetOut!),
  ]);

  const amountAtomic = parseUnits(values.amount!, assetIn.decimals);

  const [balance, quote] = await Promise.all([
    readBalance(rpc, swapper, assetIn),
    fetchQuote({
      inputMint: assetIn.mint,
      outputMint: assetOut.mint,
      amount: amountAtomic,
      slippageBps: bps,
      dynamicSlippage: dynamic,
    }),
  ]);

  const swap = await fetchSwap({ quote, swapper });

  const insufficient = (() => {
    try {
      return parseUnits(balance, assetIn.decimals) < amountAtomic;
    } catch {
      return true;
    }
  })();

  const config: JupiterSwapConfig = {
    caip2,
    swapper,
    inputMint: assetIn.mint,
    outputMint: assetOut.mint,
    assetIn: values.assetIn!,
    assetOut: values.assetOut!,
    amountAtomic: amountAtomic.toString(),
    slippageBps: bps,
    dynamicSlippage: dynamic,
  };

  const now = Date.now();
  const staleAfter = now + STALE_AFTER_MS;

  return {
    calls: [
      {
        family: "svm",
        caip2,
        kind: "tx",
        base64: swap.swapTransaction,
        lastValidBlockHeight: BigInt(swap.lastValidBlockHeight),
        staleAfter,
      },
    ],
    staleAfter,
    config,
    initialQuote: quote,
    initialQuoteAt: now,
    balance,
    insufficient,
    decimalsIn: assetIn.decimals,
    decimalsOut: assetOut.decimals,
    keeperOffers: [],
  };
}
