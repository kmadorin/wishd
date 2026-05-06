import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletPicker } from "./WalletPicker";

describe("WalletPicker", () => {
  it("renders one row per option with ecosystem label", () => {
    render(
      <WalletPicker
        rows={[
          { id: "porto", chainType: "evm", label: "Porto", onSelect: () => {} },
          { id: "phantom", chainType: "svm", label: "Phantom", onSelect: () => {} },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: /porto/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /phantom/i })).toBeInTheDocument();
  });

  it("calls onSelect for the clicked row", async () => {
    const portoSelect = vi.fn();
    const phantomSelect = vi.fn();
    render(
      <WalletPicker
        rows={[
          { id: "porto", chainType: "evm", label: "Porto", onSelect: portoSelect },
          { id: "phantom", chainType: "svm", label: "Phantom", onSelect: phantomSelect },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /phantom/i }));
    expect(phantomSelect).toHaveBeenCalledOnce();
    expect(portoSelect).not.toHaveBeenCalled();
  });

  it("renders nothing when rows is empty", () => {
    const { container } = render(<WalletPicker rows={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
