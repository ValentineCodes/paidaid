//! PaidAid engagement escrow — native NEAR + allowlisted NEP-141 (smallest units only).

use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::{U128, U64};
use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{
    env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault,
    Promise, PromiseError, PromiseOrValue,
};
use near_sdk::serde::{Deserialize, Serialize};

const MAX_ENGAGEMENT_ID_LEN: usize = 64;
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(15);
const GAS_CALLBACK: Gas = Gas::from_tgas(8);

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Escrows,
    AllowedFt,
    EngagementActive,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub enum EscrowStatus {
    Pending,
    Funded,
    Releasing,
    Refunding,
    Released,
    Refunded,
}

impl EscrowStatus {
    fn is_terminal(&self) -> bool {
        matches!(self, EscrowStatus::Released | EscrowStatus::Refunded)
    }
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub enum EscrowAsset {
    Native,
    Nep141,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Escrow {
    pub engagement_id: String,
    pub requester: AccountId,
    pub provider: AccountId,
    pub asset: EscrowAsset,
    pub ft_contract: Option<AccountId>,
    pub amount: u128,
    pub deposited: u128,
    pub status: EscrowStatus,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct PaidAidEscrow {
    owner: AccountId,
    next_id: u64,
    escrows: LookupMap<u64, Escrow>,
    /// engagement_id -> active escrow id (only non-terminal)
    engagement_active: LookupMap<String, u64>,
    allowed_ft: LookupSet<AccountId>,
}

#[derive(Deserialize)]
struct FtDepositMessage {
    escrow_id: u64,
}

#[near]
impl PaidAidEscrow {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        require!(!owner.as_str().is_empty(), "owner required");
        Self {
            owner,
            next_id: 1,
            escrows: LookupMap::new(StorageKey::Escrows),
            engagement_active: LookupMap::new(StorageKey::EngagementActive),
            allowed_ft: LookupSet::new(StorageKey::AllowedFt),
        }
    }

    /// Requester (signer) creates an escrow bound to `provider` and `engagement_id`.
    pub fn create_escrow(
        &mut self,
        engagement_id: String,
        provider: AccountId,
        asset: EscrowAsset,
        ft_contract: Option<AccountId>,
        amount: U128,
    ) -> U64 {
        let requester = env::predecessor_account_id();
        validate_engagement_id(&engagement_id);
        require!(provider != requester, "provider must differ from requester");
        let amount: u128 = amount.into();
        require!(amount > 0, "amount must be positive");

        match asset {
            EscrowAsset::Native => {
                require!(ft_contract.is_none(), "native escrow cannot set ft_contract");
            }
            EscrowAsset::Nep141 => {
                let contract = ft_contract
                    .as_ref()
                    .expect("ft_contract required for NEP-141");
                require!(self.allowed_ft.contains(contract), "FT contract not allowlisted");
            }
        }

        if let Some(active_id) = self.engagement_active.get(&engagement_id) {
            if let Some(existing) = self.escrows.get(active_id) {
                require!(existing.status.is_terminal(), "engagement already has active escrow");
            }
        }

        let id = self.next_id;
        self.next_id += 1;

        let escrow = Escrow {
            engagement_id: engagement_id.clone(),
            requester: requester.clone(),
            provider,
            asset,
            ft_contract,
            amount,
            deposited: 0,
            status: EscrowStatus::Pending,
        };

        self.escrows.insert(id, escrow);
        self.engagement_active.insert(engagement_id, id);
        U64(id)
    }

    #[payable]
    pub fn deposit_native(&mut self, escrow_id: U64) {
        let id: u64 = escrow_id.into();
        let escrow = self
            .escrows
            .get_mut(&id)
            .expect("escrow not found");
        require!(escrow.asset == EscrowAsset::Native, "escrow is not native");
        require!(escrow.status == EscrowStatus::Pending, "escrow not pending");
        require!(
            env::predecessor_account_id() == escrow.requester,
            "only requester may fund"
        );

        let deposit = env::attached_deposit();
        let deposit_yocto = deposit.as_yoctonear();
        require!(deposit_yocto == escrow.amount, "deposit must match escrow amount exactly");
        require!(escrow.deposited == 0, "already deposited");

        escrow.deposited = deposit_yocto;
        escrow.status = EscrowStatus::Funded;
    }

    pub fn release(&mut self, escrow_id: U64) -> Promise {
        let id: u64 = escrow_id.into();
        let escrow = self
            .escrows
            .get_mut(&id)
            .expect("escrow not found");
        require!(escrow.status == EscrowStatus::Funded, "escrow not funded");
        require!(
            env::predecessor_account_id() == escrow.requester,
            "only requester may release"
        );

        let amount = escrow.deposited;
        require!(amount > 0, "nothing to release");
        escrow.status = EscrowStatus::Releasing;
        let provider = escrow.provider.clone();
        let asset = escrow.asset.clone();
        let ft_contract = escrow.ft_contract.clone();

        match asset {
            EscrowAsset::Native => Promise::new(provider)
                .transfer(NearToken::from_yoctonear(amount))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_CALLBACK)
                        .on_payout_complete(U64(id), "release".to_string()),
                ),
            EscrowAsset::Nep141 => {
                let contract = ft_contract.expect("ft_contract missing");
                ext_ft::ext(contract)
                    .with_attached_deposit(NearToken::from_yoctonear(1))
                    .with_static_gas(GAS_FT_TRANSFER)
                    .ft_transfer(provider, U128(amount), None)
                    .then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(GAS_CALLBACK)
                            .on_payout_complete(U64(id), "release".to_string()),
                    )
            }
        }
    }

    /// Voluntary requester refund before release. Dispute/issue refunds are not implemented (see design doc).
    pub fn refund(&mut self, escrow_id: U64) -> Promise {
        let id: u64 = escrow_id.into();
        let escrow = self
            .escrows
            .get_mut(&id)
            .expect("escrow not found");
        require!(escrow.status == EscrowStatus::Funded, "escrow not funded");
        require!(
            env::predecessor_account_id() == escrow.requester,
            "only requester may refund"
        );

        let amount = escrow.deposited;
        require!(amount > 0, "nothing to refund");
        escrow.status = EscrowStatus::Refunding;
        let requester = escrow.requester.clone();
        let asset = escrow.asset.clone();
        let ft_contract = escrow.ft_contract.clone();

        match asset {
            EscrowAsset::Native => Promise::new(requester)
                .transfer(NearToken::from_yoctonear(amount))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_CALLBACK)
                        .on_payout_complete(U64(id), "refund".to_string()),
                ),
            EscrowAsset::Nep141 => {
                let contract = ft_contract.expect("ft_contract missing");
                ext_ft::ext(contract)
                    .with_attached_deposit(NearToken::from_yoctonear(1))
                    .with_static_gas(GAS_FT_TRANSFER)
                    .ft_transfer(requester, U128(amount), None)
                    .then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(GAS_CALLBACK)
                            .on_payout_complete(U64(id), "refund".to_string()),
                    )
            }
        }
    }

    pub fn add_allowed_ft(&mut self, contract_id: AccountId) {
        require!(env::predecessor_account_id() == self.owner, "only owner");
        validate_near_account_label(contract_id.as_str());
        self.allowed_ft.insert(contract_id);
    }

    pub fn remove_allowed_ft(&mut self, contract_id: AccountId) {
        require!(env::predecessor_account_id() == self.owner, "only owner");
        self.allowed_ft.remove(&contract_id);
    }

    pub fn get_escrow(&self, escrow_id: U64) -> Option<Escrow> {
        self.escrows.get(&(escrow_id.0)).cloned()
    }

    /// Active escrow id for an engagement (while status is non-terminal).
    pub fn get_active_escrow_id_for_engagement(&self, engagement_id: String) -> Option<U64> {
        validate_engagement_id(&engagement_id);
        self.engagement_active
            .get(&engagement_id)
            .map(|id| U64(*id))
    }

    pub fn is_ft_allowed(&self, contract_id: AccountId) -> bool {
        self.allowed_ft.contains(&contract_id)
    }

    #[private]
    pub fn on_payout_complete(&mut self, escrow_id: U64, kind: String, #[callback_result] result: Result<(), PromiseError>) {
        let id: u64 = escrow_id.into();
        let escrow = self
            .escrows
            .get_mut(&id)
            .expect("escrow not found");

        if result.is_err() {
            escrow.status = EscrowStatus::Funded;
            return;
        }

        match kind.as_str() {
            "release" => {
                escrow.status = EscrowStatus::Released;
                escrow.deposited = 0;
            }
            "refund" => {
                escrow.status = EscrowStatus::Refunded;
                escrow.deposited = 0;
            }
            _ => env::panic_str("invalid payout kind"),
        }
        self.engagement_active.remove(&escrow.engagement_id);
    }
}

#[near]
impl FungibleTokenReceiver for PaidAidEscrow {
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let parsed: FtDepositMessage =
            serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("invalid ft msg json"));
        let id = parsed.escrow_id;
        let escrow = self.escrows.get_mut(&id).expect("escrow not found");

        require!(escrow.asset == EscrowAsset::Nep141, "escrow is not NEP-141");
        require!(escrow.status == EscrowStatus::Pending, "escrow not pending");
        require!(sender_id == escrow.requester, "only requester may fund");

        let ft_contract = env::predecessor_account_id();
        require!(
            escrow.ft_contract.as_ref() == Some(&ft_contract),
            "wrong ft contract"
        );
        require!(self.allowed_ft.contains(&ft_contract), "FT not allowlisted");

        let amount_u128: u128 = amount.into();
        if amount_u128 != escrow.amount {
            return PromiseOrValue::Value(U128(amount_u128));
        }

        escrow.deposited = amount_u128;
        escrow.status = EscrowStatus::Funded;
        PromiseOrValue::Value(U128(0))
    }
}

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

fn validate_engagement_id(id: &str) {
    let t = id.trim();
    require!(!t.is_empty(), "engagement_id required");
    require!(t.len() <= MAX_ENGAGEMENT_ID_LEN, "engagement_id too long");
    require!(
        t.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'),
        "engagement_id invalid charset"
    );
}

fn validate_near_account_label(_id: &str) {
    require!(!_id.is_empty(), "account id empty");
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn builder(prepaid: NearToken) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(accounts(1))
            .signer_account_id(accounts(1))
            .attached_deposit(prepaid);
        b
    }

    fn init_contract() -> PaidAidEscrow {
        testing_env!(VMContextBuilder::new().build());
        PaidAidEscrow::new(accounts(0))
    }

    #[test]
    fn create_rejects_zero_amount() {
        let mut c = init_contract();
        testing_env!(builder(NearToken::from_near(0)).build());
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.create_escrow(
                "550e8400-e29b-41d4-a716-446655440000".to_string(),
                accounts(2),
                EscrowAsset::Native,
                None,
                U128(0),
            );
        }));
        assert!(result.is_err());
    }

    #[test]
    fn native_deposit_exact_funds() {
        let mut c = init_contract();
        testing_env!(builder(NearToken::from_near(0)).build());
        let id = c
            .create_escrow(
                "eng-1".to_string(),
                accounts(2),
                EscrowAsset::Native,
                None,
                U128(1_000_000_000_000_000_000_000_000),
            )
            .0;

        testing_env!(
            builder(NearToken::from_yoctonear(1_000_000_000_000_000_000_000_000)).build()
        );
        c.deposit_native(U64(id));

        let escrow = c.get_escrow(U64(id)).unwrap();
        assert_eq!(escrow.status, EscrowStatus::Funded);
        assert_eq!(escrow.deposited, escrow.amount);

        assert_eq!(
            c.get_active_escrow_id_for_engagement("eng-1".to_string())
                .map(|u| u.0),
            Some(id)
        );
    }

    #[test]
    fn release_requires_requester() {
        let mut c = init_contract();
        testing_env!(builder(NearToken::from_near(0)).build());
        let id = c
            .create_escrow(
                "eng-2".to_string(),
                accounts(2),
                EscrowAsset::Native,
                None,
                U128(5),
            )
            .0;
        testing_env!(builder(NearToken::from_yoctonear(5)).build());
        c.deposit_native(U64(id));

        testing_env!(VMContextBuilder::new().predecessor_account_id(accounts(3)).build());
        let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = c.release(U64(id));
        }));
        assert!(res.is_err());
    }

    #[test]
    fn duplicate_active_engagement_rejected() {
        let mut c = init_contract();
        testing_env!(builder(NearToken::from_near(0)).build());
        let _ = c.create_escrow(
            "same-eng".to_string(),
            accounts(2),
            EscrowAsset::Native,
            None,
            U128(10),
        );
        let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.create_escrow(
                "same-eng".to_string(),
                accounts(3),
                EscrowAsset::Native,
                None,
                U128(10),
            );
        }));
        assert!(res.is_err());
    }

    #[test]
    fn nep141_requires_allowlist_on_create() {
        let mut c = init_contract();
        testing_env!(builder(NearToken::from_near(0)).build());
        let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.create_escrow(
                "eng-ft".to_string(),
                accounts(2),
                EscrowAsset::Nep141,
                Some(accounts(4)),
                U128(100),
            );
        }));
        assert!(res.is_err());
    }

    #[test]
    fn payout_failure_reverts_to_funded() {
        let mut c = init_contract();
        testing_env!(builder(NearToken::from_near(0)).build());
        let id = c
            .create_escrow(
                "eng-cb".to_string(),
                accounts(2),
                EscrowAsset::Native,
                None,
                U128(50),
            )
            .0;
        testing_env!(builder(NearToken::from_yoctonear(50)).build());
        c.deposit_native(U64(id));
        let _ = c.release(U64(id));

        testing_env!(builder(NearToken::from_near(0)).build());
        c.on_payout_complete(U64(id), "release".to_string(), Err(PromiseError::Failed));

        let escrow = c.get_escrow(U64(id)).unwrap();
        assert_eq!(escrow.status, EscrowStatus::Funded);
        assert_eq!(escrow.deposited, 50);
    }

    #[test]
    fn payout_success_clears_deposit_and_terminalizes() {
        let mut c = init_contract();
        testing_env!(builder(NearToken::from_near(0)).build());
        let id = c
            .create_escrow(
                "eng-ok".to_string(),
                accounts(2),
                EscrowAsset::Native,
                None,
                U128(7),
            )
            .0;
        testing_env!(builder(NearToken::from_yoctonear(7)).build());
        c.deposit_native(U64(id));
        let _ = c.release(U64(id));

        testing_env!(builder(NearToken::from_near(0)).build());
        c.on_payout_complete(U64(id), "release".to_string(), Ok(()));

        let escrow = c.get_escrow(U64(id)).unwrap();
        assert_eq!(escrow.status, EscrowStatus::Released);
        assert_eq!(escrow.deposited, 0);
    }

    #[test]
    fn ft_on_transfer_wrong_amount_refunds_full() {
        let mut c = init_contract();
        testing_env!(
            VMContextBuilder::new()
                .predecessor_account_id(accounts(0))
                .build()
        );
        c.add_allowed_ft(accounts(4));
        testing_env!(builder(NearToken::from_near(0)).build());
        let id = c
            .create_escrow(
                "eng-ft-wrong".to_string(),
                accounts(2),
                EscrowAsset::Nep141,
                Some(accounts(4)),
                U128(1_000),
            )
            .0;

        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(4))
            .signer_account_id(accounts(1))
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
}
