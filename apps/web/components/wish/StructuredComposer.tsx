"use client";

import { useState, useMemo } from "react";
import type { IntentSchema, IntentField } from "@wishd/plugin-sdk";

export type StructuredSubmit = {
  intent: string;
  values: Record<string, string>;
};

export type StructuredComposerProps = {
  schemas: IntentSchema[];
  onSubmit: (s: StructuredSubmit) => void;
  busy?: boolean;
};

function defaultsFor(schema: IntentSchema): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of schema.fields) {
    if ("default" in f && f.default != null) out[f.key] = f.default;
    else out[f.key] = "";
  }
  return out;
}

export function StructuredComposer({ schemas, onSubmit, busy }: StructuredComposerProps) {
  const [intentId, setIntentId] = useState<string>(schemas[0]?.intent ?? "");
  const schema = useMemo(() => schemas.find((s) => s.intent === intentId), [schemas, intentId]);
  const [values, setValues] = useState<Record<string, string>>(() => (schema ? defaultsFor(schema) : {}));

  function pick(id: string) {
    setIntentId(id);
    const next = schemas.find((s) => s.intent === id);
    setValues(next ? defaultsFor(next) : {});
  }

  function setField(key: string, v: string) {
    setValues((s) => ({ ...s, [key]: v }));
  }

  function submit() {
    if (!schema) return;
    for (const f of schema.fields) {
      if (f.required && !values[f.key]) return;
    }
    onSubmit({ intent: schema.intent, values });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-wrap items-center gap-2 text-base"
    >
      <span className="text-ink-2">I want to</span>
      <select
        value={intentId}
        onChange={(e) => pick(e.target.value)}
        disabled={busy}
        className="rounded-sm bg-surface-2 border border-rule px-2 py-1 font-medium text-ink"
        aria-label="action"
      >
        {schemas.map((s) => (
          <option key={s.intent} value={s.intent} title={s.description}>
            {s.verb} — {s.description}
          </option>
        ))}
      </select>
      {schema?.fields.map((f) => (
        <FieldInput key={f.key} field={f} value={values[f.key] ?? ""} onChange={(v) => setField(f.key, v)} disabled={busy} />
      ))}
      <button
        type="submit"
        disabled={busy || !schema}
        className="ml-auto rounded-pill bg-accent text-ink px-4 py-2 font-semibold hover:bg-accent-2 disabled:opacity-50"
      >
        {busy ? "…" : "looks good →"}
      </button>
    </form>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: IntentField;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  if (field.type === "amount") {
    return (
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="amount"
        aria-label={field.key}
        className="w-24 rounded-sm bg-surface-2 border border-rule px-2 py-1 font-mono text-ink text-right"
      />
    );
  }
  if (field.type === "asset" || field.type === "chain") {
    if (field.options.length === 1) {
      return (
        <span className="rounded-pill bg-bg-2 border border-rule px-3 py-1 text-sm font-medium text-ink">
          {field.type === "chain" ? "on " : ""}
          {value || field.options[0]}
        </span>
      );
    }
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={field.key}
        className="rounded-sm bg-surface-2 border border-rule px-2 py-1 text-ink"
      >
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return null;
}
