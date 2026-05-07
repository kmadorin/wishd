import type { JupiterSwapConfig, JupiterSwapPrepared, JupiterSwapQuote } from "./types";

const QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
const SWAP_URL = "https://lite-api.jup.ag/swap/v1/swap";
const STALE_AFTER_MS = 25_000;

async function fetchQuote(config: JupiterSwapConfig): Promise<JupiterSwapQuote> {
  const qs = new URLSearchParams({
    inputMint: config.inputMint,
    outputMint: config.outputMint,
    amount: config.amountAtomic,
    slippageBps: String(config.slippageBps),
  });
  if (config.dynamicSlippage) qs.set("dynamicSlippage", "true");
  const res = await fetch(`${QUOTE_URL}?${qs.toString()}`);
  if (!res.ok) throw new Error(`jupiter quote failed: ${res.status}`);
  return (await res.json()) as JupiterSwapQuote;
}

async function fetchSwap(quote: JupiterSwapQuote, swapper: string): Promise<{
  swapTransaction: string;
  lastValidBlockHeight: number;
}> {
  const res = await fetch(SWAP_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: swapper,
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: { maxLamports: 5_000_000, priorityLevel: "high" },
      },
      dynamicComputeUnitLimit: true,
    }),
  });
  if (!res.ok) throw new Error(`jupiter swap failed: ${res.status}`);
  return (await res.json()) as { swapTransaction: string; lastValidBlockHeight: number };
}

export type RefreshInput = {
  config: JupiterSwapConfig;
  summaryId: string;
};

export async function refreshSwap(input: RefreshInput): Promise<JupiterSwapPrepared> {
  const { config } = input;
  const quote = await fetchQuote(config);
  const swap = await fetchSwap(quote, config.swapper);

  const now = Date.now();
  const staleAfter = now + STALE_AFTER_MS;

  return {
    calls: [
      {
        family: "svm",
        caip2: config.caip2,
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
    balance: "",
    insufficient: false,
    decimalsIn: 0,
    decimalsOut: 0,
    keeperOffers: [],
  };
}

export function buildRefreshHandler(): (body: unknown) => Promise<JupiterSwapPrepared> {
  return async (body) => {
    const { config, summaryId } = body as RefreshInput;
    return refreshSwap({ config, summaryId });
  };
}
