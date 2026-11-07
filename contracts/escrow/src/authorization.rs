//! PaidAid escrow funding authorization (backend ed25519 attestation, requester-signed txs).

use near_sdk::{env, require, AccountId};
use near_sdk::base64::{decode, encode};
use near_sdk::serde::{Deserialize, Serialize};

use crate::{EscrowAsset, validate_engagement_id, validate_near_account_label, MAX_ENGAGEMENT_ID_LEN};

pub const AUTH_MESSAGE_VERSION: &str = "v1";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct EscrowFundingAuthFields {
    pub contract_id: String,
    pub network_id: String,
    pub engagement_id: String,
    pub requester: String,
    pub provider: String,
    pub asset: EscrowAsset,
    pub ft_contract: Option<String>,
    pub amount: String,
    pub expires_at_ns: u64,
    pub nonce: String,
}

pub fn build_funding_auth_message(fields: &EscrowFundingAuthFields) -> String {
    let ft = fields.ft_contract.as_deref().unwrap_or("");
    let asset_tag = match fields.asset {
        EscrowAsset::Native => "Native",
        EscrowAsset::Nep141 => "Nep141",
    };
    format!(
        "PAIDAID_ESCROW_FUND_AUTH_{}\ncontract_id={}\nnetwork_id={}\nengagement_id={}\nrequester={}\nprovider={}\nasset={}\nft_contract={}\namount={}\nexpires_at_ns={}\nnonce={}",
        AUTH_MESSAGE_VERSION,
        fields.contract_id.trim(),
        fields.network_id.trim(),
        fields.engagement_id.trim(),
        fields.requester.trim(),
        fields.provider.trim(),
        asset_tag,
        ft.trim(),
        fields.amount.trim(),
        fields.expires_at_ns,
        fields.nonce.trim(),
    )
}

pub fn validate_auth_fields(fields: &EscrowFundingAuthFields) {
    require!(!fields.contract_id.trim().is_empty(), "contract_id required");
    require!(!fields.network_id.trim().is_empty(), "network_id required");
    validate_engagement_id(&fields.engagement_id);
    validate_near_account_label(fields.requester.trim());
    validate_near_account_label(fields.provider.trim());
    require!(fields.requester.trim() != fields.provider.trim(), "provider must differ");
    require!(!fields.amount.trim().is_empty(), "amount required");
    require!(
        fields.nonce.len() >= 16 && fields.nonce.len() <= 64,
        "nonce length invalid"
    );
    match fields.asset {
        EscrowAsset::Native => require!(fields.ft_contract.is_none(), "native cannot set ft"),
        EscrowAsset::Nep141 => {
            let ft = fields.ft_contract.as_ref().expect("ft_contract required");
            validate_near_account_label(ft.trim());
        }
    }
    let _eng_len = fields.engagement_id.len();
    require!(_eng_len <= MAX_ENGAGEMENT_ID_LEN, "engagement_id too long");
}

pub fn verify_funding_authorization_signature(
    fields: &EscrowFundingAuthFields,
    signature_b64: &str,
    authorized_signer_pk: &[u8; 32],
) {
    validate_auth_fields(fields);
    let message = build_funding_auth_message(fields);
    let hash = env::sha256(message.as_bytes());
    let sig_bytes = decode(signature_b64.trim()).unwrap_or_else(|_| {
        env::panic_str("invalid signature base64")
    });
    require!(sig_bytes.len() == 64, "signature must be 64 bytes");
    let sig: [u8; 64] = sig_bytes
        .try_into()
        .unwrap_or_else(|_| env::panic_str("signature length"));
    let ok = env::ed25519_verify(&sig, &hash, authorized_signer_pk);
    require!(ok, "invalid funding authorization signature");
}

pub fn parse_authorized_signer_pk_b64(value: &str) -> [u8; 32] {
    let bytes = decode(value.trim()).unwrap_or_else(|_| env::panic_str("invalid signer pk"));
    require!(bytes.len() == 32, "signer pk must be 32 bytes");
    bytes
        .try_into()
        .unwrap_or_else(|_| env::panic_str("signer pk length"))
}

#[allow(dead_code)]
pub fn encode_signature_b64(sig: &[u8; 64]) -> String {
    encode(sig)
}
