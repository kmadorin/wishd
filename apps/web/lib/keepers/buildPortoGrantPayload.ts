import type { Address, Keeper, PortoPermissionsGrant } from "@wishd/plugin-sdk";
import type { DelegationProposal } from "@/server/keepers/proposeDelegation";

// Year 2100 sentinel — fits uint32 expiry fields. If Porto/EIP-7715 uses uint256, swap to a larger value.
// Verify against reference impl in crypto-bro-calls/frontend/app/demo-workflow during integration.
export const UNLIMITED_EXPIRY_SENTINEL = 4_102_444_800; // 2100-01-01 UTC seconds

export function buildPortoGrantPayload(args: {
  keeper: Keeper;
  proposal: DelegationProposal;
  sessionPublicKey: Address;
}): PortoPermissionsGrant {
  const { keeper, proposal, sessionPublicKey } = args;
  if (keeper.delegation.kind !== "porto-permissions") {
    throw new Error("buildPortoGrantPayload: keeper delegation is not porto-permissions");
  }

  let expiry: number;
  switch (proposal.expiry.kind) {
    case "unlimited":
      expiry = UNLIMITED_EXPIRY_SENTINEL;
      break;
    case "bounded":
      expiry = Math.floor(Date.now() / 1000) + proposal.expiry.maxDays * 86_400;
      break;
    case "fixed":
      expiry = Math.floor(Date.now() / 1000) + proposal.expiry.days * 86_400;
      break;
  }

  return {
    expiry,
    feeToken: undefined,
    key: { type: "secp256k1", publicKey: sessionPublicKey },
    permissions: {
      calls: keeper.delegation.fixed.calls.map((to) => ({ to, signature: "" })),
      spend: proposal.spend.map((s) => ({ token: s.token, limit: s.limit, period: s.period })),
    },
  };
}
