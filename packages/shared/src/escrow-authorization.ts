import type { AssetStandard } from "./assets";
import type { NearNetworkId } from "./network";

export const ESCROW_FUNDING_AUTH_VERSION = "v1";

export type EscrowFundingAuthPayload = {
  contractId: string;
  networkId: NearNetworkId;
  engagementId: string;
  requester: string;
  provider: string;
  asset: AssetStandard;
  ftContractId: string | null;
  amountSmallestUnits: string;
  expiresAtNs: string;
  nonce: string;
};

/** Canonical UTF-8 message signed by the backend funding authority (SHA-256 digest). */
export function buildEscrowFundingAuthMessage(
  payload: EscrowFundingAuthPayload,
): string {
  const assetTag = payload.asset === "native" ? "Native" : "Nep141";
  const ft = payload.ftContractId?.trim() ?? "";
  return [
    `PAIDAID_ESCROW_FUND_AUTH_${ESCROW_FUNDING_AUTH_VERSION}`,
    `contract_id=${payload.contractId.trim()}`,
    `network_id=${payload.networkId.trim()}`,
    `engagement_id=${payload.engagementId.trim()}`,
    `requester=${payload.requester.trim().toLowerCase()}`,
    `provider=${payload.provider.trim().toLowerCase()}`,
    `asset=${assetTag}`,
    `ft_contract=${ft}`,
    `amount=${payload.amountSmallestUnits.trim()}`,
    `expires_at_ns=${payload.expiresAtNs.trim()}`,
    `nonce=${payload.nonce.trim()}`,
  ].join("\n");
}
