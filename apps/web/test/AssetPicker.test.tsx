import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetPicker } from "@/components/wish/AssetPicker";

vi.mock("@/lib/useBalances", () => ({
  useBalances: () => ({ balances: { ETH: "0.842", USDC: "30" }, isLoading: false, error: undefined }),
}));

describe("AssetPicker", () => {
  it("opens on click, lists tokens with balances, commits on click", async () => {
    const onChange = vi.fn();
    render(<AssetPicker chainId={11155111} value="ETH" onChange={onChange} address="0x0000000000000000000000000000000000000001" />);
    fireEvent.click(screen.getByRole("button", { name: /selected ETH/i }));
    expect(screen.getByText(/matches/i)).toBeInTheDocument();
    expect(screen.getByText("0.842")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /usdc/i }));
    expect(onChange).toHaveBeenCalledWith("USDC");
  });

  it("filters by search query", async () => {
    render(<AssetPicker chainId={11155111} value="ETH" onChange={vi.fn()} address="0x0000000000000000000000000000000000000001" />);
    fireEvent.click(screen.getByRole("button", { name: /selected ETH/i }));
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "usdc" } });
    expect(screen.queryByRole("option", { name: /^ETH/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /usdc/i })).toBeInTheDocument();
  });

  it("commits highlighted row on Enter", async () => {
    const onChange = vi.fn();
    render(<AssetPicker chainId={11155111} value="ETH" onChange={onChange} address="0x0000000000000000000000000000000000000001" />);
    const anchor = screen.getByRole("button", { name: /selected ETH/i });
    fireEvent.click(anchor);
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalled();
  });

  it("closes when controlled open flips to false", () => {
    const { rerender } = render(
      <AssetPicker chainId={11155111} value="ETH" onChange={vi.fn()} address="0x0000000000000000000000000000000000000001" open onOpenChange={() => {}} />,
    );
    expect(screen.getByText(/matches/i)).toBeInTheDocument();
    rerender(
      <AssetPicker chainId={11155111} value="ETH" onChange={vi.fn()} address="0x0000000000000000000000000000000000000001" open={false} onOpenChange={() => {}} />,
    );
    expect(screen.queryByText(/matches/i)).not.toBeInTheDocument();
  });
});
