import { promises as fs } from "node:fs";
import path from "node:path";
import type { IntentSchema } from "@wishd/plugin-sdk";

const DEFAULT_HEADER = `You are wishd, a DeFi assistant on Sepolia (chainId 11155111).`;

const NARRATE_HEADER = `You are wishd's narrator. The widget is already prepared and rendered. Your job: stream a single short paragraph (<= 2 sentences) acknowledging the action, mentioning amount + asset + market, and stating readiness or warning if context.values + context.prepared show a problem (e.g. insufficient balance). Do NOT call any tools. Do NOT call prepare_*. Do NOT call widget.render. Plain text only.`;

function intentSummary(intents: IntentSchema[]): string {
  if (intents.length === 0) return "(none registered)";
  return intents
    .map((s) => {
      const fields = s.fields.map((f) => `${f.key}:${f.type}`).join(", ");
      return `- ${s.intent} (verb: ${s.verb}; widget: ${s.widget}; fields: ${fields})`;
    })
    .join("\n");
}

const CANONICAL_FLOWS = `Canonical flows:

A. Deposit/lend/supply intent — wishes like "deposit/lend/supply N USDC into Compound" (Sepolia):
  1. Call mcp__compound__prepare_deposit({ amount: N, user, chainId }).
  2. Call mcp__widget__render({ type: "compound-summary", props: { amount: N, asset: "USDC", market: "cUSDCv3", needsApprove, summaryId, amountWei, chainId, user, comet, usdc, calls, balance, insufficient } }).
  3. Reply with one short narration line.

B. Withdraw/redeem intent — wishes like "withdraw N USDC from Compound" (Sepolia):
  1. Call mcp__compound__prepare_withdraw({ amount: N, user, chainId }).
  2. Call mcp__widget__render({ type: "compound-withdraw-summary", props: { amount, asset, market, summaryId, amountWei, chainId, user, comet, usdc, calls, supplied, insufficient } }).
  3. Reply with one short narration line.

C. Follow-up "execute deposit <summaryId>" — user message includes context.prepared:
  1. Call mcp__widget__render({ type: "compound-execute", props: { ...context.prepared } }) (omit actionKind for deposit).
  2. Reply with one short narration line.

D. Follow-up "execute withdraw <summaryId>" — user message includes context.prepared and context.preparedKind === "withdraw":
  1. Call mcp__widget__render({ type: "compound-execute", props: { ...context.prepared, actionKind: "withdraw" } }).
  2. Reply with one short narration line.

For known intent shapes, do NOT use ToolSearch. The tools you need are listed above. ToolSearch is only for genuinely novel free-text wishes that none of the canonical flows handle.

Stop after rendering. Widgets handle clicks and chain interaction.`;

export type BuildPromptInput = {
  mode?: "default" | "narrate-only";
  intents?: IntentSchema[];
  userId?: string;
};

export async function buildSystemPrompt(input: BuildPromptInput = {}): Promise<string> {
  const { mode = "default", intents = [], userId } = input;

  let body: string;
  if (mode === "narrate-only") {
    body = `${DEFAULT_HEADER}\n\n${NARRATE_HEADER}\n\nRegistered intents (for context only — do NOT call any tools):\n${intentSummary(intents)}`;
  } else {
    body = `${DEFAULT_HEADER}

Registered intent schemas (canonical, prefer these over ToolSearch):
${intentSummary(intents)}

Tools available:
- mcp__compound__prepare_deposit({ amount, user, chainId }): prepares Compound v3 USDC deposit. Returns prepared.calls + prepared.meta { needsApprove, balance, insufficient }.
- mcp__compound__prepare_withdraw({ amount, user, chainId }): prepares Compound v3 USDC withdraw. Returns prepared.calls + prepared.meta { supplied, insufficient }.
- mcp__widget__render({ type, props, slot? }): renders a widget into the user workspace.

${CANONICAL_FLOWS}`;
  }

  if (!userId) return body;
  const profilePath = path.join(process.cwd(), "users", userId, "CLAUDE.md");
  try {
    const profile = await fs.readFile(profilePath, "utf-8");
    return `${body}\n\nUser profile:\n${profile}`;
  } catch {
    return body;
  }
}
