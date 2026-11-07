import { createHash, randomBytes } from "node:crypto";

import { KeyPair, type KeyPairString } from "@near-js/crypto";
import {
  buildEscrowFundingAuthMessage,
  type AssetStandard,
  type EscrowFundingAuthPayload,
  type NearNetworkId,
} from "@paidaid/shared";

export type EscrowCreateAuthorization = {
  payload: EscrowFundingAuthPayload;
  signatureBase64: string;
  methodArgs: {
    engagement_id: string;
    provider: string;
    asset: "Native" | "Nep141";
    ft_contract: string | null;
    amount: string;
    expires_at_ns: string;
    nonce: string;
    signature: string;
    network_id: string;
  };
};

const DEFAULT_TTL_MS = 30 * 60 * 1000;

function readFundingSignerKeyPair(): KeyPair {
  const raw = process.env.NEAR_ESCROW_FUNDING_SIGNER_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error(
      "NEAR_ESCROW_FUNDING_SIGNER_PRIVATE_KEY is required to authorize escrow funding.",
    );
  }
  return KeyPair.fromString(raw as KeyPairString);
}

export function signEscrowFundingAuthorization(
  input: Omit<
    EscrowFundingAuthPayload,
    "expiresAtNs" | "nonce"
  > & {
    expiresAtNs?: bigint;
    nonce?: string;
  },
): EscrowCreateAuthorization {
  const nonce =
    input.nonce ??
    randomBytes(16).toString("hex") + randomBytes(16).toString("hex");
  const expiresAtNs =
    input.expiresAtNs ??
    BigInt(Date.now() * 1_000_000 + DEFAULT_TTL_MS * 1_000_000);

  const payload: EscrowFundingAuthPayload = {
    contractId: input.contractId,
    networkId: input.networkId,
    engagementId: input.engagementId,
    requester: input.requester.toLowerCase(),
    provider: input.provider.toLowerCase(),
    asset: input.asset,
    ftContractId: input.ftContractId,
    amountSmallestUnits: input.amountSmallestUnits,
    expiresAtNs: expiresAtNs.toString(),
    nonce,
  };

  const message = buildEscrowFundingAuthMessage(payload);
  const digest = createHash("sha256").update(message, "utf8").digest();
  const keyPair = readFundingSignerKeyPair();
  const sig = keyPair.sign(digest);
  const signatureBase64 = Buffer.from(sig.signature).toString("base64");

  const asset = input.asset === "native" ? "Native" : "Nep141";

  return {
    payload,
    signatureBase64,
    methodArgs: {
      engagement_id: payload.engagementId,
      provider: payload.provider,
      asset,
      ft_contract:
        asset === "Nep141" ? input.ftContractId?.trim() ?? null : null,
      amount: payload.amountSmallestUnits,
      expires_at_ns: payload.expiresAtNs,
      nonce: payload.nonce,
      signature: signatureBase64,
      network_id: payload.networkId,
    },
  };
}

export function assetStandardToAuthAsset(
  standard: AssetStandard,
): EscrowFundingAuthPayload["asset"] {
  return standard;
}

export function nearNetworkIdForAuth(networkId: NearNetworkId): NearNetworkId {
  return networkId;
}
