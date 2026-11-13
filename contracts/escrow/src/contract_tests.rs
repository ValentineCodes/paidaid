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
        .fund_escrow(engagement_id.to_string(), provider, U128(amount))
        .0
}

fn fund_native_milestones(
    contract: &mut PaidAidEscrow,
    requester: near_sdk::AccountId,
    engagement_id: &str,
    provider: near_sdk::AccountId,
    milestones: &[u128],
) -> u64 {
    let total: u128 = milestone_sum(milestones);
    let mut b = contract_env(requester);
    b.attached_deposit(NearToken::from_yoctonear(total));
    testing_env!(b.build());
    let ms: Vec<U128> = milestones.iter().copied().map(U128).collect();
    contract
        .fund_escrow_milestones(engagement_id.to_string(), provider, ms)
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

fn ft_fund_msg_milestones(
    engagement_id: &str,
    provider: near_sdk::AccountId,
    milestones: &[u128],
) -> String {
    let ms: Vec<String> = milestones.iter().map(|m| m.to_string()).collect();
    serde_json::json!({
        "version": FT_MSG_VERSION,
        "engagement_id": engagement_id,
        "provider": provider,
        "milestones": ms,
    })
    .to_string()
}

fn complete_milestone_release(contract: &mut PaidAidEscrow, escrow_id: u64, milestone_index: u8) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(escrow_contract())
        .build());
    contract.on_payout_complete(
        U64(escrow_id),
        format!("{}{}", PAYOUT_KIND_MILESTONE_PREFIX, milestone_index),
        Ok(()),
    );
}

fn complete_full_release(contract: &mut PaidAidEscrow, escrow_id: u64) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(escrow_contract())
        .build());
    contract.on_payout_complete(U64(escrow_id), PAYOUT_KIND_RELEASE.to_string(), Ok(()));
}

// --- existing single-payment tests (regression) ---

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
    assert!(!escrow.is_milestone_escrow());
    assert_eq!(escrow.milestones_released, 0);
    assert!(escrow.milestone_amounts.is_empty());
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
    assert!(c
        .get_active_escrow_id_for_engagement("eng-ft-no-list".to_string())
        .is_none());
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
    assert!(!escrow.is_milestone_escrow());
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

#[test]
fn ordinary_full_release_unchanged_via_callback() {
    let mut c = init_contract();
    let amount = 100u128;
    let id = fund_native(&mut c, accounts(1), "eng-full-rel", accounts(2), amount);
    testing_env!(contract_env(accounts(1)).build());
    let _ = c.release(U64(id));
    let escrow = c.get_escrow(U64(id)).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Releasing);

    complete_full_release(&mut c, id);
    let escrow = c.get_escrow(U64(id)).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Released);
    assert_eq!(escrow.deposited, 0);
    assert!(c
        .get_active_escrow_id_for_engagement("eng-full-rel".to_string())
        .is_none());
}

// --- milestone funding ---

#[test]
fn native_fund_two_milestones() {
    let mut c = init_contract();
    let milestones = [40u128, 60u128];
    let id = fund_native_milestones(&mut c, accounts(1), "eng-ms-2", accounts(2), &milestones);
    let escrow = c.get_escrow(U64(id)).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Funded);
    assert_eq!(escrow.amount, 100);
    assert_eq!(escrow.deposited, 100);
    assert_eq!(escrow.milestone_amounts, milestones);
    assert_eq!(escrow.milestones_released, 0);
    assert!(escrow.is_milestone_escrow());
}

#[test]
fn native_fund_five_milestones() {
    let mut c = init_contract();
    let milestones = [10u128, 20, 30, 25, 15];
    let id = fund_native_milestones(&mut c, accounts(1), "eng-ms-5", accounts(2), &milestones);
    let escrow = c.get_escrow(U64(id)).unwrap();
    assert_eq!(milestone_sum(&escrow.milestone_amounts), 100);
    assert_eq!(escrow.milestone_amounts.len(), 5);
}

#[test]
fn reject_single_milestone_fund() {
    let mut c = init_contract();
    let mut b = contract_env(accounts(1));
    b.attached_deposit(NearToken::from_yoctonear(50));
    testing_env!(b.build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.fund_escrow_milestones("eng-ms-1".to_string(), accounts(2), vec![U128(50)]);
    }));
    assert!(res.is_err());
}

#[test]
fn reject_six_milestones_fund() {
    let mut c = init_contract();
    let ms = vec![U128(10); 6];
    let mut b = contract_env(accounts(1));
    b.attached_deposit(NearToken::from_yoctonear(60));
    testing_env!(b.build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.fund_escrow_milestones("eng-ms-6".to_string(), accounts(2), ms);
    }));
    assert!(res.is_err());
}

#[test]
fn reject_zero_milestone_amount() {
    let mut c = init_contract();
    let mut b = contract_env(accounts(1));
    b.attached_deposit(NearToken::from_yoctonear(100));
    testing_env!(b.build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.fund_escrow_milestones(
            "eng-ms-zero".to_string(),
            accounts(2),
            vec![U128(100), U128(0)],
        );
    }));
    assert!(res.is_err());
}

#[test]
fn reject_milestone_sum_mismatch_native() {
    let mut c = init_contract();
    let mut b = contract_env(accounts(1));
    b.attached_deposit(NearToken::from_yoctonear(100));
    testing_env!(b.build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.fund_escrow_milestones(
            "eng-ms-mis".to_string(),
            accounts(2),
            vec![U128(30), U128(30)],
        );
    }));
    assert!(res.is_err());
}

#[test]
fn milestone_release_blocked_on_ordinary_release() {
    let mut c = init_contract();
    let milestones = [50u128, 50u128];
    let id = fund_native_milestones(
        &mut c,
        accounts(1),
        "eng-ms-no-rel",
        accounts(2),
        &milestones,
    );
    testing_env!(contract_env(accounts(1)).build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.release(U64(id));
    }));
    assert!(res.is_err());
}

#[test]
fn sequential_milestone_release_updates_balance() {
    let mut c = init_contract();
    let milestones = [30u128, 70u128];
    let id = fund_native_milestones(&mut c, accounts(1), "eng-ms-seq", accounts(2), &milestones);

    testing_env!(contract_env(accounts(1)).build());
    let _ = c.release_milestone(U64(id), 0);
    complete_milestone_release(&mut c, id, 0);

    let escrow = c.get_escrow(U64(id)).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Funded);
    assert_eq!(escrow.milestones_released, 1);
    assert_eq!(escrow.deposited, 70);

    testing_env!(contract_env(accounts(1)).build());
    let _ = c.release_milestone(U64(id), 1);
    complete_milestone_release(&mut c, id, 1);

    let escrow = c.get_escrow(U64(id)).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Released);
    assert_eq!(escrow.milestones_released, 2);
    assert_eq!(escrow.deposited, 0);
    assert!(c
        .get_active_escrow_id_for_engagement("eng-ms-seq".to_string())
        .is_none());
}

#[test]
fn reject_out_of_order_milestone_release() {
    let mut c = init_contract();
    let id = fund_native_milestones(&mut c, accounts(1), "eng-ms-order", accounts(2), &[10, 90]);
    testing_env!(contract_env(accounts(1)).build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.release_milestone(U64(id), 1);
    }));
    assert!(res.is_err());
}

#[test]
fn reject_duplicate_milestone_release_after_first_paid() {
    let mut c = init_contract();
    let id = fund_native_milestones(&mut c, accounts(1), "eng-ms-dup", accounts(2), &[25, 75]);
    testing_env!(contract_env(accounts(1)).build());
    let _ = c.release_milestone(U64(id), 0);
    complete_milestone_release(&mut c, id, 0);

    testing_env!(contract_env(accounts(1)).build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.release_milestone(U64(id), 0);
    }));
    assert!(res.is_err());
}

#[test]
fn release_milestone_requires_requester() {
    let mut c = init_contract();
    let id = fund_native_milestones(&mut c, accounts(1), "eng-ms-auth", accounts(2), &[40, 60]);
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(accounts(3))
        .build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.release_milestone(U64(id), 0);
    }));
    assert!(res.is_err());
}

#[test]
fn failed_milestone_payout_restores_funded_state() {
    let mut c = init_contract();
    let id = fund_native_milestones(&mut c, accounts(1), "eng-ms-fail", accounts(2), &[30, 70]);
    testing_env!(contract_env(accounts(1)).build());
    let _ = c.release_milestone(U64(id), 0);

    let mut escrow = c.get_escrow(U64(id)).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Releasing);

    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(escrow_contract())
        .build());
    c.on_payout_complete(
        U64(id),
        format!("{}{}", PAYOUT_KIND_MILESTONE_PREFIX, 0),
        Err(PromiseError::Failed),
    );

    escrow = c.get_escrow(U64(id)).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Funded);
    assert_eq!(escrow.milestones_released, 0);
    assert_eq!(escrow.deposited, 100);
}

#[test]
fn nep141_milestone_fund_success() {
    let mut c = init_contract();
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(accounts(0))
        .build());
    c.add_allowed_ft(accounts(4));

    let milestones = [200u128, 300u128];
    let total = 500u128;
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(accounts(4))
        .build());
    let msg = ft_fund_msg_milestones("eng-ft-ms", accounts(2), &milestones);
    let out = c.ft_on_transfer(accounts(1), U128(total), msg);
    match out {
        PromiseOrValue::Value(v) => assert_eq!(v.0, 0),
        PromiseOrValue::Promise(_) => panic!("expected keep-all"),
    }

    let active = c
        .get_active_escrow_id_for_engagement("eng-ft-ms".to_string())
        .unwrap();
    let escrow = c.get_escrow(active).unwrap();
    assert_eq!(escrow.milestone_amounts, milestones);
    assert_eq!(escrow.deposited, total);
}

#[test]
fn nep141_invalid_milestone_sum_refunds() {
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
    let msg = ft_fund_msg_milestones("eng-ft-ms-bad", accounts(2), &[400, 400]);
    let out = c.ft_on_transfer(accounts(1), U128(amount), msg);
    match out {
        PromiseOrValue::Value(v) => assert_eq!(v.0, amount),
        PromiseOrValue::Promise(_) => panic!("expected refund"),
    }
    assert!(c
        .get_active_escrow_id_for_engagement("eng-ft-ms-bad".to_string())
        .is_none());
}

#[test]
fn nep141_milestone_json_number_refunds() {
    let mut c = init_contract();
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(accounts(0))
        .build());
    c.add_allowed_ft(accounts(4));

    let amount = 500u128;
    testing_env!(VMContextBuilder::new()
        .current_account_id(escrow_contract())
        .predecessor_account_id(accounts(4))
        .build());
    // Using JSON numbers instead of strings must fail funding and refund.
    let msg = r#"{"version":"v2","engagement_id":"eng-ft-num","provider":"bob.test","milestones":[200,300]}"#;
    let out = c.ft_on_transfer(accounts(1), U128(amount), msg.to_string());
    match out {
        PromiseOrValue::Value(v) => assert_eq!(v.0, amount),
        PromiseOrValue::Promise(_) => panic!("expected refund"),
    }
}

#[test]
fn validate_milestone_helpers() {
    assert!(!validate_milestone_amounts(&[]));
    assert!(!validate_milestone_amounts(&[1]));
    assert!(validate_milestone_amounts(&[1, 2]));
    assert!(!validate_milestone_amounts(&[1, 0, 2]));
    assert!(parse_milestone_amount_strings(&["100".to_string(), "200".to_string()]).is_some());
    assert!(parse_milestone_amount_strings(&["100".to_string(), "x".to_string()]).is_none());
}
