use super::*;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::testing_env;
use near_sdk::NearToken;

const FT_MSG_VERSION: &str = "v2";

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

fn init_contract() -> PaidAidEscrow {
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .build());
    PaidAidEscrow::new(accounts(0))
}

fn fund_native(
    contract: &mut PaidAidEscrow,
    requester: near_sdk::AccountId,
    engagement_id: &str,
    provider: near_sdk::AccountId,
    amount: u128,
) -> u64 {
    let mut b = contract_env(requester);
    b.attached_deposit(NearToken::from_yoctonear(amount));
    testing_env!(b.build());
    contract
        .fund_escrow(
            engagement_id.to_string(),
            provider,
            U128(amount),
        )
        .0
}

fn ft_fund_msg(engagement_id: &str, provider: near_sdk::AccountId) -> String {
    serde_json::json!({
        "version": FT_MSG_VERSION,
        "engagement_id": engagement_id,
        "provider": provider,
    })
    .to_string()
}

#[test]
fn incorrect_native_attached_deposit_fails() {
    let mut c = init_contract();
    let amount = 1_000u128;
    let mut b = contract_env(accounts(1));
    b.attached_deposit(NearToken::from_yoctonear(amount - 1));
    testing_env!(b.build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.fund_escrow("eng-1".to_string(), accounts(2), U128(amount));
    }));
    assert!(res.is_err());
}

#[test]
fn native_fund_escrow_creates_funded_record() {
    let mut c = init_contract();
    let amount = 1_000_000_000_000_000_000_000_000u128;
    let id = fund_native(&mut c, accounts(1), "eng-1", accounts(2), amount);
    let escrow = c.get_escrow(U64(id)).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Funded);
    assert_eq!(escrow.deposited, escrow.amount);
    assert_eq!(escrow.deposited, amount);
    assert_eq!(escrow.requester, accounts(1));
}

#[test]
fn fund_escrow_rejects_other_requester_while_active() {
    let mut c = init_contract();
    let _ = fund_native(&mut c, accounts(1), "shared-eng", accounts(2), 10);
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = fund_native(&mut c, accounts(4), "shared-eng", accounts(2), 10);
    }));
    assert!(res.is_err());
}

#[test]
fn duplicate_active_engagement_rejected() {
    let mut c = init_contract();
    let _ = fund_native(&mut c, accounts(1), "same-eng", accounts(2), 10);
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = fund_native(&mut c, accounts(1), "same-eng", accounts(3), 10);
    }));
    assert!(res.is_err());
}

#[test]
fn wrong_provider_equals_requester_fails() {
    let mut c = init_contract();
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = fund_native(&mut c, accounts(1), "eng-self", accounts(1), 10);
    }));
    assert!(res.is_err());
}

#[test]
fn nep141_unsupported_token_refunds_on_ft_transfer() {
    let mut c = init_contract();
    let amount = 1_000u128;
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(accounts(4))
        .build());
    let msg = ft_fund_msg("eng-ft-no-list", accounts(2));
    let out = c.ft_on_transfer(accounts(1), U128(amount), msg);
    match out {
        PromiseOrValue::Value(v) => assert_eq!(v.0, amount),
        PromiseOrValue::Promise(_) => panic!("expected full refund"),
    }
    assert!(c.get_active_escrow_id_for_engagement("eng-ft-no-list".to_string()).is_none());
}

#[test]
fn nep141_fund_escrow_success() {
    let mut c = init_contract();
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(accounts(0))
        .build());
    c.add_allowed_ft(accounts(4));
    let amount = 1_000u128;
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(accounts(4))
        .build());
    let msg = ft_fund_msg("eng-ft-ok", accounts(2));
    let out = c.ft_on_transfer(accounts(1), U128(amount), msg);
    match out {
        PromiseOrValue::Value(v) => assert_eq!(v.0, 0),
        PromiseOrValue::Promise(_) => panic!("expected keep-all"),
    }
    let active = c
        .get_active_escrow_id_for_engagement("eng-ft-ok".to_string())
        .unwrap();
    let escrow = c.get_escrow(active).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Funded);
    assert_eq!(escrow.deposited, amount);
    assert_eq!(escrow.asset, EscrowAsset::Nep141);
    assert_eq!(escrow.requester, accounts(1));
}

#[test]
fn nep141_v1_auth_msg_refunds() {
    let mut c = init_contract();
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(accounts(0))
        .build());
    c.add_allowed_ft(accounts(4));
    let amount = 1_000u128;
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(accounts(4))
        .build());
    let msg = r#"{"version":"v1","engagement_id":"old","provider":"bob.test"}"#;
    let out = c.ft_on_transfer(accounts(1), U128(amount), msg.to_string());
    match out {
        PromiseOrValue::Value(v) => assert_eq!(v.0, amount),
        PromiseOrValue::Promise(_) => panic!("expected refund"),
    }
}

#[test]
fn release_requires_requester() {
    let mut c = init_contract();
    let id = fund_native(&mut c, accounts(1), "eng-rel", accounts(2), 5);
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(accounts(3))
        .build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.release(U64(id));
    }));
    assert!(res.is_err());
}

#[test]
fn refund_requires_requester() {
    let mut c = init_contract();
    let id = fund_native(&mut c, accounts(1), "eng-ref", accounts(2), 5);
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(accounts(3))
        .build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.refund(U64(id));
    }));
    assert!(res.is_err());
}
