// plugins/uniswap/strategies/fetchWithRetry.ts
export type RetryOpts = {
  maxRetries?: number;
  baseDelayMs?: number;
  capDelayMs?: number;
  totalBudgetMs?: number;
  fetchImpl?: typeof fetch;
};

export async function fetchWithRetry(url: string, init: RequestInit, opts: RetryOpts = {}): Promise<Response> {
  const { maxRetries = 5, baseDelayMs = 250, capDelayMs = 10_000, totalBudgetMs = 12_000, fetchImpl = fetch } = opts;
  const start = Date.now();
  let attempt = 0;
  for (;;) {
    const res = await fetchImpl(url, init);
    if (res.ok) return res;
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`http ${res.status}: ${await safeText(res)}`);
    }
    if (attempt >= maxRetries || Date.now() - start > totalBudgetMs) {
      throw new Error(`http ${res.status} after ${attempt} retries: ${await safeText(res)}`);
    }
    const exp = Math.min(capDelayMs, baseDelayMs * 2 ** attempt);
    const jitter = Math.floor(Math.random() * exp * 0.25);
    await new Promise((r) => setTimeout(r, exp + jitter));
    attempt += 1;
  }
}

async function safeText(r: Response): Promise<string> {
  try { return (await r.text()).slice(0, 200); } catch { return ""; }
}
