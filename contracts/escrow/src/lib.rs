//! PaidAid engagement escrow — native NEAR + allowlisted NEP-141 (smallest units only).
//!
//! Funding is **requester-direct**: `predecessor_account_id` (native) or NEP-141 `sender_id`
//! is stored as the escrow requester. No backend attestation signatures.

use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::{U128, U64};
use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{
    env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault,
    Promise, PromiseError, PromiseOrValue,
};
use near_sdk::serde::{Deserialize, Serialize};

pub(crate) const MAX_ENGAGEMENT_ID_LEN: usize = 64;
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(15);
const GAS_CALLBACK: Gas = Gas::from_tgas(8);
const FT_FUND_MSG_VERSION: &str = "v2";

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

/// NEP-141 `ft_transfer_call` message: requester is `sender_id` from the token contract.
#[derive(Deserialize)]
struct FtFundEscrowMessage {
    version: String,
    engagement_id: String,
    provider: AccountId,
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

    /// Requester funds native NEAR: creates the escrow record and locks funds in one call.
    ///
    /// Caller (`predecessor_account_id`) becomes the immutable requester on the record.
    #[payable]
    pub fn fund_escrow(
        &mut self,
        engagement_id: String,
        provider: AccountId,
        amount: U128,
    ) -> U64 {
        let requester = env::predecessor_account_id();
        let amount_u128: u128 = amount.into();
        require!(amount_u128 > 0, "amount must be positive");

        let attached = env::attached_deposit().as_yoctonear();
        require!(
            attached == amount_u128,
            "attached deposit must match amount exactly"
        );

        self.fund_escrow_direct(
            requester,
            engagement_id,
            provider,
            EscrowAsset::Native,
            None,
            amount_u128,
        )
    }

    fn fund_escrow_direct(
        &mut self,
        requester: AccountId,
        engagement_id: String,
        provider: AccountId,
        asset: EscrowAsset,
        ft_contract: Option<AccountId>,
        amount_u128: u128,
    ) -> U64 {
        require!(amount_u128 > 0, "amount must be positive");
        require!(provider != requester, "provider must differ from requester");
        validate_engagement_id(&engagement_id);

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

        self.assert_no_conflicting_active_escrow(&engagement_id, &requester);

        self.insert_funded_escrow_record(
            engagement_id,
            requester,
            provider,
            asset,
            ft_contract,
            amount_u128,
        )
    }

    fn assert_no_conflicting_active_escrow(&self, engagement_id: &str, requester: &AccountId) {
        validate_engagement_id(engagement_id);
        let Some(active_id) = self.engagement_active.get(engagement_id) else {
            return;
        };
        let Some(existing) = self.escrows.get(active_id) else {
            return;
        };
        if existing.status.is_terminal() {
            return;
        }
        require!(
            existing.requester == *requester,
            "engagement has active escrow owned by another requester"
        );
        require!(false, "engagement already has active escrow");
    }

    fn has_conflicting_active_escrow(
        &self,
        engagement_id: &str,
        requester: &AccountId,
    ) -> bool {
        let Some(active_id) = self.engagement_active.get(engagement_id) else {
            return false;
        };
        let Some(existing) = self.escrows.get(active_id) else {
            return false;
        };
        if existing.status.is_terminal() {
            return false;
        }
        if existing.requester != *requester {
            return true;
        }
        true
    }

    fn try_fund_escrow_from_ft(
        &mut self,
        sender_id: AccountId,
        ft_contract: AccountId,
        amount_u128: u128,
        parsed: FtFundEscrowMessage,
    ) -> bool {
        if amount_u128 == 0 {
            return false;
        }
        if parsed.version != FT_FUND_MSG_VERSION {
            return false;
        }
        if parsed.provider == sender_id {
            return false;
        }
        if !Self::engagement_id_syntax_valid(&parsed.engagement_id) {
            return false;
        }
        if !self.allowed_ft.contains(&ft_contract) {
            return false;
        }
        if Self::has_conflicting_active_escrow(self, &parsed.engagement_id, &sender_id) {
            return false;
        }

        self.fund_escrow_direct(
            sender_id,
            parsed.engagement_id,
            parsed.provider,
            EscrowAsset::Nep141,
            Some(ft_contract),
            amount_u128,
        );
        true
    }

    fn engagement_id_syntax_valid(id: &str) -> bool {
        let t = id.trim();
        if t.is_empty() || t.len() > MAX_ENGAGEMENT_ID_LEN {
            return false;
        }
        t.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    }

    fn insert_funded_escrow_record(
        &mut self,
        engagement_id: String,
        requester: AccountId,
        provider: AccountId,
        asset: EscrowAsset,
        ft_contract: Option<AccountId>,
        amount: u128,
    ) -> U64 {
        validate_engagement_id(&engagement_id);

        let id = self.next_id;
        self.next_id += 1;

        let escrow = Escrow {
            engagement_id: engagement_id.clone(),
            requester: requester.clone(),
            provider,
            asset,
            ft_contract,
            amount,
            deposited: amount,
            status: EscrowStatus::Funded,
        };

        self.escrows.insert(id, escrow);
        self.engagement_active.insert(engagement_id, id);
        U64(id)
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

    /// Voluntary requester refund before release.
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
    pub fn on_payout_complete(
        &mut self,
        escrow_id: U64,
        kind: String,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
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
        let amount_u128: u128 = amount.into();
        let parsed: FtFundEscrowMessage = match serde_json::from_str(&msg) {
            Ok(v) => v,
            Err(_) => return PromiseOrValue::Value(U128(amount_u128)),
        };

        let ft_contract = env::predecessor_account_id();
        if self.try_fund_escrow_from_ft(sender_id, ft_contract, amount_u128, parsed) {
            PromiseOrValue::Value(U128(0))
        } else {
            PromiseOrValue::Value(U128(amount_u128))
        }
    }
}

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

pub(crate) fn validate_engagement_id(id: &str) {
    let t = id.trim();
    require!(!t.is_empty(), "engagement_id required");
    require!(t.len() <= MAX_ENGAGEMENT_ID_LEN, "engagement_id too long");
    require!(
        t.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'),
        "engagement_id invalid charset"
    );
}

pub(crate) fn validate_near_account_label(_id: &str) {
    require!(!_id.is_empty(), "account id empty");
}

#[cfg(test)]
mod contract_tests;
