import { describe, it, expect, beforeEach } from "vitest";
import { useWalletMenu } from "./walletMenu";

describe("walletMenu store", () => {
  beforeEach(() => useWalletMenu.getState().close());

  it("starts closed", () => {
    expect(useWalletMenu.getState().drawerOpen).toBe(false);
  });

  it("open() flips drawerOpen to true", () => {
    useWalletMenu.getState().open();
    expect(useWalletMenu.getState().drawerOpen).toBe(true);
  });

  it("close() flips drawerOpen to false", () => {
    useWalletMenu.getState().open();
    useWalletMenu.getState().close();
    expect(useWalletMenu.getState().drawerOpen).toBe(false);
  });

  it("toggle() inverts drawerOpen", () => {
    useWalletMenu.getState().toggle();
    expect(useWalletMenu.getState().drawerOpen).toBe(true);
    useWalletMenu.getState().toggle();
    expect(useWalletMenu.getState().drawerOpen).toBe(false);
  });
});
