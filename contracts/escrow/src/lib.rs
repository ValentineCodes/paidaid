//! PaidAid engagement escrow — native NEAR + allowlisted NEP-141 (smallest units only).

mod authorization;

use authorization::{
    build_funding_auth_message, parse_authorized_signer_pk_b64, verify_funding_authorization_signature,
    EscrowFundingAuthFields,
};
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

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Escrows,
    AllowedFt,
    EngagementActive,
    UsedAuthNonces,
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
    /// Ed25519 public key bytes for backend funding attestations (32 bytes).
    authorized_signer_pk: [u8; 32],
    used_auth_nonces: LookupSet<String>,
}

#[derive(Deserialize)]
struct FtDepositMessage {
    escrow_id: u64,
}

#[near]
impl PaidAidEscrow {
    #[init]
    pub fn new(owner: AccountId, authorized_signer_pk_b64: String) -> Self {
        require!(!owner.as_str().is_empty(), "owner required");
        let pk = parse_authorized_signer_pk_b64(&authorized_signer_pk_b64);
        Self {
            owner,
            next_id: 1,
            escrows: LookupMap::new(StorageKey::Escrows),
            engagement_active: LookupMap::new(StorageKey::EngagementActive),
            allowed_ft: LookupSet::new(StorageKey::AllowedFt),
            authorized_signer_pk: pk,
            used_auth_nonces: LookupSet::new(StorageKey::UsedAuthNonces),
        }
    }

    pub fn set_authorized_signer(&mut self, authorized_signer_pk_b64: String) {
        require!(env::predecessor_account_id() == self.owner, "only owner");
        self.authorized_signer_pk = parse_authorized_signer_pk_b64(&authorized_signer_pk_b64);
    }

    pub fn get_authorized_signer_pk_b64(&self) -> String {
        near_sdk::base64::encode(self.authorized_signer_pk)
    }

    /// Unauthenticated escrow creation is disabled (V2.2). Use `create_escrow_with_authorization`.
    pub fn create_escrow(
        &mut self,
        _engagement_id: String,
        _provider: AccountId,
        _asset: EscrowAsset,
        _ft_contract: Option<AccountId>,
        _amount: U128,
    ) -> U64 {
        env::panic_str("create_escrow requires backend authorization; use create_escrow_with_authorization");
    }

    /// Requester (signer) creates an escrow with a valid backend attestation.
    pub fn create_escrow_with_authorization(
        &mut self,
        engagement_id: String,
        provider: AccountId,
        asset: EscrowAsset,
        ft_contract: Option<AccountId>,
        amount: U128,
        expires_at_ns: U64,
        nonce: String,
        signature: String,
        network_id: String,
    ) -> U64 {
        let requester = env::predecessor_account_id();
        let contract_id = env::current_account_id();
        let amount_u128: u128 = amount.into();
        require!(amount_u128 > 0, "amount must be positive");
        require!(
            env::block_timestamp() <= expires_at_ns.0,
            "funding authorization expired"
        );
        require!(
            !self.used_auth_nonces.contains(&nonce),
            "authorization nonce already used"
        );

        let ft_label = ft_contract.as_ref().map(|a| a.to_string());
        let fields = EscrowFundingAuthFields {
            contract_id: contract_id.to_string(),
            network_id,
            engagement_id: engagement_id.clone(),
            requester: requester.to_string(),
            provider: provider.to_string(),
            asset: asset.clone(),
            ft_contract: ft_label,
            amount: amount_u128.to_string(),
            expires_at_ns: expires_at_ns.0,
            nonce: nonce.clone(),
        };
        let expected_message = build_funding_auth_message(&fields);
        verify_funding_authorization_signature(&fields, &signature, &self.authorized_signer_pk);

        require!(provider != requester, "provider must differ from requester");
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

        self.used_auth_nonces.insert(nonce);

        self.insert_escrow_record(
            engagement_id,
            requester,
            provider,
            asset,
            ft_contract,
            amount_u128,
            &expected_message,
        )
    }

    fn insert_escrow_record(
        &mut self,
        engagement_id: String,
        requester: AccountId,
        provider: AccountId,
        asset: EscrowAsset,
        ft_contract: Option<AccountId>,
        amount: u128,
        _auth_message_hint: &str,
    ) -> U64 {
        validate_engagement_id(&engagement_id);

        if let Some(active_id) = self.engagement_active.get(&engagement_id) {
            if let Some(existing) = self.escrows.get(active_id) {
                if !existing.status.is_terminal() {
                    require!(
                        existing.requester == requester,
                        "engagement has active escrow owned by another requester"
                    );
                    require!(false, "engagement already has active escrow");
                }
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
