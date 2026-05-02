import { describe, it, expect } from "vitest";
import { buildPortoGrantPayload, UNLIMITED_EXPIRY_SENTINEL } from "./buildPortoGrantPayload";
import autoCompoundComp from "@wishd/keeper-auto-compound-comp";
import type { Address } from "@wishd/plugin-sdk";

describe("buildPortoGrantPayload", () => {
  it("uses far-future sentinel for unlimited expiry", () => {
    const payload = buildPortoGrantPayload({
      keeper: autoCompoundComp,
      proposal: { expiry: { kind: "unlimited" }, spend: [] },
      sessionPublicKey: "0x000000000000000000000000000000000000dEaD" as Address,
    });
    expect(payload.expiry).toBe(UNLIMITED_EXPIRY_SENTINEL);
  });

  it("maps allowlist 1:1 from delegation.fixed.calls", () => {
    const payload = buildPortoGrantPayload({
      keeper: autoCompoundComp,
      proposal: { expiry: { kind: "unlimited" }, spend: [] },
      sessionPublicKey: "0x000000000000000000000000000000000000dEaD" as Address,
    });
    if (autoCompoundComp.delegation.kind !== "porto-permissions") throw new Error();
    expect(payload.permissions.calls.map((c) => c.to.toLowerCase()))
      .toEqual(autoCompoundComp.delegation.fixed.calls.map((c) => c.to.toLowerCase()));
    expect(payload.permissions.calls.map((c) => c.signature))
      .toEqual(autoCompoundComp.delegation.fixed.calls.map((c) => c.signature));
  });

  it("includes spend entries from the proposal", () => {
    if (autoCompoundComp.delegation.kind !== "porto-permissions") throw new Error();
    const t = autoCompoundComp.delegation.fixed.calls[0]!.to; // any
    const payload = buildPortoGrantPayload({
      keeper: autoCompoundComp,
      proposal: {
        expiry: { kind: "unlimited" },
        spend: [{ token: t, limit: 5n, period: "month" }],
      },
      sessionPublicKey: "0x000000000000000000000000000000000000dEaD" as Address,
    });
    expect(payload.permissions.spend?.[0]).toMatchObject({ token: t, limit: 5n, period: "month" });
  });

  it("passes feeToken object through unchanged", () => {
    const payload = buildPortoGrantPayload({
      keeper: autoCompoundComp,
      proposal: { expiry: { kind: "unlimited" }, spend: [] },
      sessionPublicKey: "0x000000000000000000000000000000000000dEaD" as Address,
    });
    expect(payload.feeToken).toEqual({ symbol: "ETH", limit: "0.05" });
  });
});
