//! PaidAid engagement escrow — native NEAR + allowlisted NEP-141 (smallest units only).
//!
//! Funding is **requester-direct**: `predecessor_account_id` (native) or NEP-141 `sender_id`
//! is stored as the escrow requester. No backend attestation signatures.

use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{
    env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault,
    Promise, PromiseError, PromiseOrValue,
};

pub(crate) const MAX_ENGAGEMENT_ID_LEN: usize = 64;
pub(crate) const MIN_MILESTONES: usize = 2;
pub(crate) const MAX_MILESTONES: usize = 5;
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(15);
const GAS_CALLBACK: Gas = Gas::from_tgas(8);
const FT_FUND_MSG_VERSION: &str = "v2";
const PAYOUT_KIND_RELEASE: &str = "release";
const PAYOUT_KIND_REFUND: &str = "refund";
const PAYOUT_KIND_MILESTONE_PREFIX: &str = "milestone:";

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
    /// Total agreed budget (smallest units).
    pub amount: u128,
    /// Remaining locked balance (smallest units).
    pub deposited: u128,
    pub status: EscrowStatus,
    /// Fixed milestone payouts; empty = ordinary single-payment escrow.
    pub milestone_amounts: Vec<u128>,
    /// Count of milestones successfully paid on-chain.
    pub milestones_released: u8,
}

impl Escrow {
    /// True when this record uses sequential milestone releases.
    pub fn is_milestone_escrow(&self) -> bool {
        !self.milestone_amounts.is_empty()
    }
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
    /// Optional milestone amounts as decimal integer strings (smallest units).
    milestones: Option<Vec<String>>,
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
    pub fn fund_escrow(&mut self, engagement_id: String, provider: AccountId, amount: U128) -> U64 {
        let requester = env::predecessor_account_id();
        let amount_u128: u128 = amount.into();
        require!(amount_u128 > 0, "amount must be positive");

        let attached = env::attached_deposit().as_yoctonear();
        require!(
            attached == amount_u128,
            "attached deposit must match amount exactly"
        );

        self.fund_escrow_internal(
            requester,
            engagement_id,
            provider,
            EscrowAsset::Native,
            None,
            amount_u128,
            Vec::new(),
        )
    }

    /// Requester funds native NEAR with a fixed 2–5 milestone schedule (upfront full budget).
    #[payable]
    pub fn fund_escrow_milestones(
        &mut self,
        engagement_id: String,
        provider: AccountId,
        milestones: Vec<U128>,
    ) -> U64 {
        let requester = env::predecessor_account_id();
        let amounts: Vec<u128> = milestones.into_iter().map(|m| m.0).collect();
        require!(
            validate_milestone_amounts(&amounts),
            "invalid milestone schedule"
        );
        let total: u128 = milestone_sum(&amounts);
        require!(total > 0, "milestone total must be positive");

        let attached = env::attached_deposit().as_yoctonear();
        require!(
            attached == total,
            "attached deposit must match milestone sum exactly"
        );

        self.fund_escrow_internal(
            requester,
            engagement_id,
            provider,
            EscrowAsset::Native,
            None,
            total,
            amounts,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn fund_escrow_internal(
        &mut self,
        requester: AccountId,
        engagement_id: String,
        provider: AccountId,
        asset: EscrowAsset,
        ft_contract: Option<AccountId>,
        amount_u128: u128,
        milestone_amounts: Vec<u128>,
    ) -> U64 {
        require!(amount_u128 > 0, "amount must be positive");
        require!(provider != requester, "provider must differ from requester");
        validate_engagement_id(&engagement_id);

        if !milestone_amounts.is_empty() {
            require!(
                validate_milestone_amounts(&milestone_amounts),
                "invalid milestone schedule"
            );
            require!(
                milestone_sum(&milestone_amounts) == amount_u128,
                "milestone sum must match amount"
            );
        }

        match asset {
            EscrowAsset::Native => {
                require!(
                    ft_contract.is_none(),
                    "native escrow cannot set ft_contract"
                );
            }
            EscrowAsset::Nep141 => {
                let contract = ft_contract
                    .as_ref()
                    .expect("ft_contract required for NEP-141");
                require!(
                    self.allowed_ft.contains(contract),
                    "FT contract not allowlisted"
                );
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
            milestone_amounts,
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

    fn has_conflicting_active_escrow(&self, engagement_id: &str, requester: &AccountId) -> bool {
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

        let milestone_amounts = match parsed.milestones {
            None => Vec::new(),
            Some(ref raw) => {
                let Some(amounts) = parse_milestone_amount_strings(raw) else {
                    return false;
                };
                if !validate_milestone_amounts(&amounts) {
                    return false;
                }
                if milestone_sum(&amounts) != amount_u128 {
                    return false;
                }
                amounts
            }
        };

        let _ = self.fund_escrow_internal(
            sender_id,
            parsed.engagement_id,
            parsed.provider,
            EscrowAsset::Nep141,
            Some(ft_contract),
            amount_u128,
            milestone_amounts,
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

    #[allow(clippy::too_many_arguments)]
    fn insert_funded_escrow_record(
        &mut self,
        engagement_id: String,
        requester: AccountId,
        provider: AccountId,
        asset: EscrowAsset,
        ft_contract: Option<AccountId>,
        amount: u128,
        milestone_amounts: Vec<u128>,
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
            milestone_amounts,
            milestones_released: 0,
        };

        self.escrows.insert(id, escrow);
        self.engagement_active.insert(engagement_id, id);
        U64(id)
    }

    pub fn release(&mut self, escrow_id: U64) -> Promise {
        let id: u64 = escrow_id.into();
        let escrow = self.escrows.get_mut(&id).expect("escrow not found");
        require!(escrow.status == EscrowStatus::Funded, "escrow not funded");
        require!(
            !escrow.is_milestone_escrow(),
            "milestone escrows must use release_milestone"
        );
        require!(
            env::predecessor_account_id() == escrow.requester,
            "only requester may release"
        );

        let amount = escrow.deposited;
        require!(amount > 0, "nothing to release");
        escrow.status = EscrowStatus::Releasing;

        self.begin_provider_payout(id, amount, PAYOUT_KIND_RELEASE.to_string())
    }

    /// Release the next sequential milestone payout to the provider.
    pub fn release_milestone(&mut self, escrow_id: U64, milestone_index: u8) -> Promise {
        let id: u64 = escrow_id.into();
        let (payout, kind) = {
            let escrow = self.escrows.get_mut(&id).expect("escrow not found");
            require!(escrow.status == EscrowStatus::Funded, "escrow not funded");
            require!(escrow.is_milestone_escrow(), "not a milestone escrow");
            require!(
                env::predecessor_account_id() == escrow.requester,
                "only requester may release"
            );

            let next = escrow.milestones_released;
            require!(
                milestone_index == next,
                "milestone must be released in order"
            );
            let idx = milestone_index as usize;
            require!(
                idx < escrow.milestone_amounts.len(),
                "milestone index out of range"
            );

            let payout = escrow.milestone_amounts[idx];
            require!(payout > 0, "milestone amount invalid");
            require!(payout <= escrow.deposited, "milestone exceeds deposited");

            escrow.status = EscrowStatus::Releasing;
            let kind = format!("{PAYOUT_KIND_MILESTONE_PREFIX}{milestone_index}");
            (payout, kind)
        };

        self.begin_provider_payout(id, payout, kind)
    }

    fn begin_provider_payout(&self, id: u64, amount: u128, kind: String) -> Promise {
        let escrow = self.escrows.get(&id).expect("escrow not found");
        let provider = escrow.provider.clone();
        let asset = escrow.asset.clone();
        let ft_contract = escrow.ft_contract.clone();

        match asset {
            EscrowAsset::Native => Promise::new(provider)
                .transfer(NearToken::from_yoctonear(amount))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_CALLBACK)
                        .on_payout_complete(U64(id), kind),
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
                            .on_payout_complete(U64(id), kind),
                    )
            }
        }
    }

    /// Voluntary requester refund before release (returns remaining `deposited`).
    pub fn refund(&mut self, escrow_id: U64) -> Promise {
        let id: u64 = escrow_id.into();
        let escrow = self.escrows.get_mut(&id).expect("escrow not found");
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
                        .on_payout_complete(U64(id), PAYOUT_KIND_REFUND.to_string()),
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
                            .on_payout_complete(U64(id), PAYOUT_KIND_REFUND.to_string()),
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
        let escrow = self.escrows.get_mut(&id).expect("escrow not found");

        if result.is_err() {
            escrow.status = EscrowStatus::Funded;
            return;
        }

        if let Some(index_str) = kind.strip_prefix(PAYOUT_KIND_MILESTONE_PREFIX) {
            let index: u8 = index_str
                .parse()
                .unwrap_or_else(|_| env::panic_str("invalid milestone payout kind"));
            let idx = index as usize;
            require!(escrow.is_milestone_escrow(), "not a milestone escrow");
            require!(
                index == escrow.milestones_released,
                "milestone payout out of sync"
            );
            require!(
                idx < escrow.milestone_amounts.len(),
                "milestone index out of range"
            );

            let payout = escrow.milestone_amounts[idx];
            require!(payout <= escrow.deposited, "milestone exceeds deposited");
            escrow.deposited -= payout;
            escrow.milestones_released = escrow
                .milestones_released
                .checked_add(1)
                .expect("milestone count overflow");

            let total = escrow.milestone_amounts.len();
            if escrow.milestones_released as usize >= total {
                require!(
                    escrow.deposited == 0,
                    "milestone escrow must settle to zero"
                );
                escrow.status = EscrowStatus::Released;
                self.engagement_active.remove(&escrow.engagement_id);
            } else {
                escrow.status = EscrowStatus::Funded;
            }
            return;
        }

        match kind.as_str() {
            PAYOUT_KIND_RELEASE => {
                require!(
                    !escrow.is_milestone_escrow(),
                    "milestone escrows must use release_milestone"
                );
                escrow.status = EscrowStatus::Released;
                escrow.deposited = 0;
            }
            PAYOUT_KIND_REFUND => {
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

pub(crate) fn validate_milestone_amounts(amounts: &[u128]) -> bool {
    let n = amounts.len();
    if !(MIN_MILESTONES..=MAX_MILESTONES).contains(&n) {
        return false;
    }
    amounts.iter().all(|&a| a > 0)
}

pub(crate) fn milestone_sum(amounts: &[u128]) -> u128 {
    amounts.iter().fold(0u128, |acc, v| acc.saturating_add(*v))
}

pub(crate) fn parse_milestone_amount_strings(raw: &[String]) -> Option<Vec<u128>> {
    let mut out = Vec::with_capacity(raw.len());
    for s in raw {
        let t = s.trim();
        if t.is_empty() || !t.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        let v: u128 = t.parse().ok()?;
        if v == 0 {
            return None;
        }
        out.push(v);
    }
    Some(out)
}

#[cfg(test)]
mod contract_tests;
