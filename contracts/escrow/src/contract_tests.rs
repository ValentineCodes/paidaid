use super::*;
use crate::authorization::{build_funding_auth_message, EscrowFundingAuthFields};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::testing_env;
use rand::rngs::OsRng;
use sha2::{Digest, Sha256};

const NETWORK: &str = "localnet";

fn escrow_contract() -> near_sdk::AccountId {
    "escrow.test".parse().unwrap()
}

fn contract_env(requester: near_sdk::AccountId) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id(escrow_contract())
        .predecessor_account_id(requester.clone())
        .signer_account_id(requester);
    b
}

fn test_signing_key() -> SigningKey {
    SigningKey::generate(&mut OsRng)
}

fn init_contract(signing_key: &SigningKey) -> PaidAidEscrow {
    let pk_b64 = STANDARD.encode(signing_key.verifying_key().to_bytes());
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .build());
    PaidAidEscrow::new(accounts(0), pk_b64)
}

fn sign_fields(signing_key: &SigningKey, fields: &EscrowFundingAuthFields) -> String {
    let message = build_funding_auth_message(fields);
    let digest = Sha256::digest(message.as_bytes());
    let sig = signing_key.sign(&digest);
    STANDARD.encode(sig.to_bytes())
}

fn auth_fields(
    engagement_id: &str,
    requester: &str,
    provider: &str,
    asset: EscrowAsset,
    ft: Option<&str>,
    amount: u128,
    expires_at_ns: u64,
    nonce: &str,
) -> EscrowFundingAuthFields {
    EscrowFundingAuthFields {
        contract_id: escrow_contract().to_string(),
        network_id: NETWORK.to_string(),
        engagement_id: engagement_id.to_string(),
        requester: requester.to_string(),
        provider: provider.to_string(),
        asset,
        ft_contract: ft.map(|s| s.to_string()),
        amount: amount.to_string(),
        expires_at_ns,
        nonce: nonce.to_string(),
    }
}

fn authorized_create(
    contract: &mut PaidAidEscrow,
    signing_key: &SigningKey,
    requester: near_sdk::AccountId,
    engagement_id: &str,
    provider: near_sdk::AccountId,
    asset: EscrowAsset,
    ft_contract: Option<near_sdk::AccountId>,
    amount: u128,
    nonce: &str,
) -> u64 {
    let expires = near_sdk::env::block_timestamp() + 60 * 60 * 1_000_000_000;
    let fields = auth_fields(
        engagement_id,
        requester.as_str(),
        provider.as_str(),
        asset.clone(),
        ft_contract.as_ref().map(|a| a.as_str()),
        amount,
        expires,
        nonce,
    );
    let signature = sign_fields(signing_key, &fields);
    testing_env!(contract_env(requester).build());
    contract
        .create_escrow_with_authorization(
            engagement_id.to_string(),
            provider,
            asset,
            ft_contract,
            U128(amount),
            U64(expires),
            nonce.to_string(),
            signature,
            NETWORK.to_string(),
        )
        .0
}

#[test]
fn legacy_create_escrow_rejected() {
    let sk = test_signing_key();
    let mut c = init_contract(&sk);
    testing_env!(contract_env(accounts(1)).build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.create_escrow(
            "eng-legacy".to_string(),
            accounts(2),
            EscrowAsset::Native,
            None,
            U128(1),
        );
    }));
    assert!(res.is_err());
}

#[test]
fn unauthorized_create_without_valid_signature() {
    let sk = test_signing_key();
    let mut c = init_contract(&sk);
    testing_env!(contract_env(accounts(1)).build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.create_escrow_with_authorization(
            "eng-bad".to_string(),
            accounts(2),
            EscrowAsset::Native,
            None,
            U128(10),
            U64(near_sdk::env::block_timestamp() + 60_000_000_000),
            "0123456789abcdef0123456789abcdef".to_string(),
            STANDARD.encode([0u8; 64]),
            NETWORK.to_string(),
        );
    }));
    assert!(res.is_err());
}

#[test]
fn wrong_requester_in_tx_fails() {
    let sk = test_signing_key();
    let mut c = init_contract(&sk);
    let expires = near_sdk::env::block_timestamp() + 60_000_000_000;
    let fields = auth_fields(
        "eng-wr-req",
        accounts(1).as_str(),
        accounts(2).as_str(),
        EscrowAsset::Native,
        None,
        10,
        expires,
        "11111111111111111111111111111111",
    );
    let signature = sign_fields(&sk, &fields);
    testing_env!(contract_env(accounts(3)).build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.create_escrow_with_authorization(
            "eng-wr-req".to_string(),
            accounts(2),
            EscrowAsset::Native,
            None,
            U128(10),
            U64(expires),
            "11111111111111111111111111111111".to_string(),
            signature,
            NETWORK.to_string(),
        );
    }));
    assert!(res.is_err());
}

#[test]
fn wrong_provider_in_payload_fails() {
    let sk = test_signing_key();
    let mut c = init_contract(&sk);
    let expires = near_sdk::env::block_timestamp() + 60_000_000_000;
    let fields = auth_fields(
        "eng-wr-prov",
        accounts(1).as_str(),
        accounts(2).as_str(),
        EscrowAsset::Native,
        None,
        10,
        expires,
        "22222222222222222222222222222222",
    );
    let signature = sign_fields(&sk, &fields);
    testing_env!(contract_env(accounts(1)).build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.create_escrow_with_authorization(
            "eng-wr-prov".to_string(),
            accounts(3),
            EscrowAsset::Native,
            None,
            U128(10),
            U64(expires),
            "22222222222222222222222222222222".to_string(),
            signature,
            NETWORK.to_string(),
        );
    }));
    assert!(res.is_err());
}

#[test]
fn expired_authorization_rejected() {
    let sk = test_signing_key();
    let mut c = init_contract(&sk);
    let expires = 1u64;
    let fields = auth_fields(
        "eng-exp",
        accounts(1).as_str(),
        accounts(2).as_str(),
        EscrowAsset::Native,
        None,
        5,
        expires,
        "33333333333333333333333333333333",
    );
    let signature = sign_fields(&sk, &fields);
    let mut ctx = contract_env(accounts(1));
    ctx.block_timestamp(10_000_000_000);
    testing_env!(ctx.build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.create_escrow_with_authorization(
            "eng-exp".to_string(),
            accounts(2),
            EscrowAsset::Native,
            None,
            U128(5),
            U64(expires),
            "33333333333333333333333333333333".to_string(),
            signature,
            NETWORK.to_string(),
        );
    }));
    assert!(res.is_err());
}

#[test]
fn replayed_nonce_rejected() {
    let sk = test_signing_key();
    let mut c = init_contract(&sk);
    let _ = authorized_create(
        &mut c,
        &sk,
        accounts(1),
        "eng-replay",
        accounts(2),
        EscrowAsset::Native,
        None,
        8,
        "44444444444444444444444444444444",
    );
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = authorized_create(
            &mut c,
            &sk,
            accounts(1),
            "eng-replay-2",
            accounts(2),
            EscrowAsset::Native,
            None,
            8,
            "44444444444444444444444444444444",
        );
    }));
    assert!(res.is_err());
}

#[test]
fn native_deposit_exact_funds() {
    let sk = test_signing_key();
    let mut c = init_contract(&sk);
    let amount = 1_000_000_000_000_000_000_000_000u128;
    let id = authorized_create(
        &mut c,
        &sk,
        accounts(1),
        "eng-1",
        accounts(2),
        EscrowAsset::Native,
        None,
        amount,
        "55555555555555555555555555555555",
    );
    let mut b = contract_env(accounts(1));
    b.attached_deposit(NearToken::from_yoctonear(amount));
    testing_env!(b.build());
    c.deposit_native(U64(id));
    let escrow = c.get_escrow(U64(id)).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Funded);
    assert_eq!(escrow.deposited, escrow.amount);
}

#[test]
fn create_escrow_rejects_other_requester_while_active() {
    let sk = test_signing_key();
    let mut c = init_contract(&sk);
    let _ = authorized_create(
        &mut c,
        &sk,
        accounts(1),
        "shared-eng",
        accounts(2),
        EscrowAsset::Native,
        None,
        10,
        "66666666666666666666666666666666",
    );
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = authorized_create(
            &mut c,
            &sk,
            accounts(4),
            "shared-eng",
            accounts(2),
            EscrowAsset::Native,
            None,
            10,
            "66666666666666666666666666666667",
        );
    }));
    assert!(res.is_err());
}

#[test]
fn duplicate_active_engagement_rejected() {
    let sk = test_signing_key();
    let mut c = init_contract(&sk);
    let _ = authorized_create(
        &mut c,
        &sk,
        accounts(1),
        "same-eng",
        accounts(2),
        EscrowAsset::Native,
        None,
        10,
        "77777777777777777777777777777777",
    );
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = authorized_create(
            &mut c,
            &sk,
            accounts(1),
            "same-eng",
            accounts(3),
            EscrowAsset::Native,
            None,
            10,
            "77777777777777777777777777777778",
        );
    }));
    assert!(res.is_err());
}

#[test]
fn nep141_requires_allowlist_on_create() {
    let sk = test_signing_key();
    let mut c = init_contract(&sk);
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = authorized_create(
            &mut c,
            &sk,
            accounts(1),
            "eng-ft",
            accounts(2),
            EscrowAsset::Nep141,
            Some(accounts(4)),
            100,
            "88888888888888888888888888888888",
        );
    }));
    assert!(res.is_err());
}

#[test]
fn ft_on_transfer_wrong_amount_refunds_full() {
    let sk = test_signing_key();
    let mut c = init_contract(&sk);
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(accounts(0))
        .build());
    c.add_allowed_ft(accounts(4));
    let id = authorized_create(
        &mut c,
        &sk,
        accounts(1),
        "eng-ft-wrong",
        accounts(2),
        EscrowAsset::Nep141,
        Some(accounts(4)),
        1_000,
        "99999999999999999999999999999999",
    );
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(accounts(4))
        .build());
    let out = c.ft_on_transfer(
        accounts(1),
        U128(999),
        format!(r#"{{"escrow_id":{id}}}"#),
    );
    match out {
        PromiseOrValue::Value(v) => assert_eq!(v.0, 999),
        PromiseOrValue::Promise(_) => panic!("expected refund value"),
    }
    let escrow = c.get_escrow(U64(id)).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Pending);
}

#[test]
fn release_requires_requester() {
    let sk = test_signing_key();
    let mut c = init_contract(&sk);
    let id = authorized_create(
        &mut c,
        &sk,
        accounts(1),
        "eng-rel",
        accounts(2),
        EscrowAsset::Native,
        None,
        5,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    let mut b = contract_env(accounts(1));
    b.attached_deposit(NearToken::from_yoctonear(5));
    testing_env!(b.build());
    c.deposit_native(U64(id));
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(accounts(3))
        .build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.release(U64(id));
    }));
    assert!(res.is_err());
}
