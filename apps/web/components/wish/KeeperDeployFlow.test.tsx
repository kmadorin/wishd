import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useKeeperDeploy } from "@/store/keeperDeploy";
import { KeeperDeployFlow } from "./KeeperDeployFlow";

const mutateAsync = vi.fn();

// Mock wagmi hooks to avoid provider requirements
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x1111111111111111111111111111111111111111" }),
  useConnectorClient: () => ({ data: undefined }),
}));

vi.mock("porto/wagmi/Hooks", () => ({
  useGrantPermissions: () => ({ mutateAsync }),
}));

// Mock fetch for the deploy call
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function renderReviewPhase() {
  useKeeperDeploy.getState().openDeploy({
    offer: {
      keeperId: "auto-compound-comp",
      title: "Auto-compound COMP rewards",
      desc: "Hourly auto-compound",
      state: { kind: "not_deployed" },
    },
  });
  return render(<KeeperDeployFlow />);
}

describe("KeeperDeployFlow", () => {
  beforeEach(() => {
    useKeeperDeploy.getState().close();
    mutateAsync.mockReset();
    fetchMock.mockReset();
  });

  it("renders review phase title when an offer is opened", () => {
    renderReviewPhase();
    expect(screen.getByText(/Auto-compound COMP rewards/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
  });

  it("renders nothing when not open", () => {
    useKeeperDeploy.getState().close();
    const { container } = render(<KeeperDeployFlow />);
    expect(container.firstChild).toBeNull();
  });

  it("calls useGrantPermissions.mutateAsync with feeToken object + bigint spend limits on Continue", async () => {
    mutateAsync.mockResolvedValue({ id: "0xabc", key: { publicKey: "0xdEaD" } });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    renderReviewPhase();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const arg = mutateAsync.mock.calls[0]![0];
    expect(arg.feeToken).toMatchObject({ symbol: "ETH", limit: "0.05" });
    expect(typeof arg.permissions.spend[0].limit).toBe("bigint");
  });

  it("renders narrative card from manifest.explainer.whatThisDoes", () => {
    renderReviewPhase();
    expect(screen.getByText(/claims your COMP rewards/i)).toBeInTheDocument();
  });

  it("displays spend caps in decimal units (100, not 100000000000000000000)", () => {
    renderReviewPhase();
    const inputs = screen.getAllByRole("textbox");
    const compInput = inputs.find((i) => (i as HTMLInputElement).getAttribute("aria-label") === "spend cap COMP");
    expect((compInput as HTMLInputElement).value).toBe("100");
  });

  it("clamps spend cap to bound.maxLimit on input", async () => {
    const user = userEvent.setup();
    renderReviewPhase();
    const inputs = screen.getAllByRole("textbox");
    const compInput = inputs.find((i) => (i as HTMLInputElement).getAttribute("aria-label") === "spend cap COMP")!;
    await user.clear(compInput);
    await user.type(compInput, "99999");
    // bound is 1000 COMP/month
    expect((compInput as HTMLInputElement).value).toBe("1000");
  });

  it("humanizes Porto RPC validation error in error phase", async () => {
    mutateAsync.mockRejectedValue(new Error("Invalid parameters were provided to the RPC method."));
    renderReviewPhase();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(screen.getByText(/usually a config mismatch/i)).toBeInTheDocument());
    expect(screen.getByText(/technical details/i)).toBeInTheDocument();
    // raw text inside <details><pre>
    expect(screen.getByText(/Invalid parameters were provided to the RPC method/i)).toBeInTheDocument();
  });

  it("allows typing a partial decimal like '1.' without erasing the dot", async () => {
    const user = userEvent.setup();
    renderReviewPhase();
    const inputs = screen.getAllByRole("textbox");
    const compInput = inputs.find((i) => (i as HTMLInputElement).getAttribute("aria-label") === "spend cap COMP")!;
    await user.clear(compInput);
    await user.type(compInput, "1.5");
    expect((compInput as HTMLInputElement).value).toBe("1.5");
  });

  it("truncates over-precision input to token decimals", async () => {
    const user = userEvent.setup();
    renderReviewPhase();
    const inputs = screen.getAllByRole("textbox");
    const usdcInput = inputs.find((i) => (i as HTMLInputElement).getAttribute("aria-label") === "spend cap USDC")!;
    await user.clear(usdcInput);
    await user.type(usdcInput, "1.1234567");
    // truncated to 6 decimals
    expect((usdcInput as HTMLInputElement).value).toBe("1.123456");
  });

  it("collapses 'allowed contract calls' by default and toggles open", async () => {
    const user = userEvent.setup();
    renderReviewPhase();
    expect(screen.queryByText(/Compound · CometRewards/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: /allowed contract calls/i }));
    expect(screen.getByText(/Compound · CometRewards/i)).toBeInTheDocument();
  });
});
