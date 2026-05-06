import { describe, it, expect } from "vitest";
import { isStale } from "./blockhash";

describe("isStale", () => {
  it("undefined staleAfter → never stale", () => {
    expect(isStale(undefined, 1_000_000)).toBe(false);
  });
  it("now < staleAfter → false", () => {
    expect(isStale(2_000, 1_000)).toBe(false);
  });
  it("now >= staleAfter → true", () => {
    expect(isStale(1_000, 1_000)).toBe(true);
    expect(isStale(500, 1_000)).toBe(true);
  });
});
