import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { KeyPair } from "@near-js/crypto";
import { SANDBOX_DIR } from "./constants.mjs";

export const FUNDING_SIGNER_FILE = `${SANDBOX_DIR}/escrow-funding-signer.json`;

export async function loadOrCreateEscrowFundingSigner() {
  try {
    const raw = await fs.readFile(FUNDING_SIGNER_FILE, "utf8");
    const { privateKey } = JSON.parse(raw);
    return KeyPair.fromString(privateKey);
  } catch {
    const keyPair = KeyPair.fromRandom("ED25519");
    await fs.mkdir(SANDBOX_DIR, { recursive: true });
    await fs.writeFile(
      FUNDING_SIGNER_FILE,
      `${JSON.stringify({ privateKey: keyPair.toString() }, null, 2)}\n`,
    );
    return keyPair;
  }
}

export function buildEscrowFundingAuthMessage(payload) {
  const assetTag = payload.asset === "Native" ? "Native" : "Nep141";
  const ft = payload.ftContractId?.trim() ?? "";
  return [
    "PAIDAID_ESCROW_FUND_AUTH_v1",
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

export function signEscrowFundingAuthorization(
  keyPair,
  {
    contractId,
    networkId,
    engagementId,
    requester,
    provider,
    asset,
    ftContractId,
    amountSmallestUnits,
    expiresAtNs,
    nonce,
  },
) {
  const message = buildEscrowFundingAuthMessage({
    contractId,
    networkId,
    engagementId,
    requester,
    provider,
    asset,
    ftContractId,
    amountSmallestUnits,
    expiresAtNs,
    nonce,
  });
  const digest = createHash("sha256").update(message, "utf8").digest();
  const sig = keyPair.sign(digest);
  return {
    message,
    signatureBase64: Buffer.from(sig.signature).toString("base64"),
  };
}

export function authorizedSignerPkB64(keyPair) {
  const bytes = keyPair.getPublicKey().data;
  return Buffer.from(bytes).toString("base64");
}
