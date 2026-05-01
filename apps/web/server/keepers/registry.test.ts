import { describe, it, expect } from "vitest";
import { keepersForIntent, getKeeperById, allKeepers } from "./registry";

describe("keeper registry", () => {
  it("lists at least the auto-compound-comp keeper", () => {
    const ids = allKeepers().map((k) => k.manifest.id);
    expect(ids).toContain("auto-compound-comp");
  });

  it("returns the keeper for compound-v3.deposit", () => {
    const list = keepersForIntent("compound-v3.deposit");
    expect(list.map((k) => k.manifest.id)).toContain("auto-compound-comp");
  });

  it("also matches compound-v3.lend", () => {
    const list = keepersForIntent("compound-v3.lend");
    expect(list.map((k) => k.manifest.id)).toContain("auto-compound-comp");
  });

  it("returns empty for unrelated intent", () => {
    expect(keepersForIntent("aave-v3.borrow")).toEqual([]);
  });

  it("getKeeperById returns null for unknown id", () => {
    expect(getKeeperById("nope")).toBeNull();
  });

  it("getKeeperById returns the keeper for a known id", () => {
    expect(getKeeperById("auto-compound-comp")?.manifest.id).toBe("auto-compound-comp");
  });
});
