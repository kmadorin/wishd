import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useKeeperDeploy } from "@/store/keeperDeploy";
import { KeeperDeployFlow } from "./KeeperDeployFlow";

// Mock wagmi hooks to avoid provider requirements
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined }),
  useConnectorClient: () => ({ data: undefined }),
}));

describe("KeeperDeployFlow", () => {
  beforeEach(() => {
    useKeeperDeploy.getState().close();
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
});
