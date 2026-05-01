import type { IntentSchema } from "./index";

export type SentencePart =
  | { kind: "field"; key: string }
  | { kind: "connector"; text: string };

export function renderSentenceParts(schema: IntentSchema): SentencePart[] {
  const out: SentencePart[] = [];
  for (const f of schema.fields) {
    const c = schema.connectors?.[f.key];
    if (c) out.push({ kind: "connector", text: c });
    out.push({ kind: "field", key: f.key });
  }
  return out;
}
