import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

describe("KeeperDeployFlow", () => {
  beforeEach(() => {
    useKeeperDeploy.getState().close();
    mutateAsync.mockReset();
    fetchMock.mockReset();
  });

  it("renders review phase title when an offer is opened", () => {
    useKeeperDeploy.getState().openDeploy({
      offer: {
        keeperId: "auto-compound-comp",
        title: "Auto-compound COMP rewards",
        desc: "Hourly auto-compound",
        state: { kind: "not_deployed" },
      },
    });
    render(<KeeperDeployFlow />);
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

    useKeeperDeploy.getState().openDeploy({
      offer: {
        keeperId: "auto-compound-comp",
        title: "Auto-compound COMP rewards",
        desc: "Hourly auto-compound",
        state: { kind: "not_deployed" },
      },
    });
    render(<KeeperDeployFlow />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const arg = mutateAsync.mock.calls[0]![0];
    expect(arg.feeToken).toMatchObject({ symbol: "ETH", limit: "0.05" });
    expect(typeof arg.permissions.spend[0].limit).toBe("bigint");
  });
});
