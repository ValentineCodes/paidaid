// PaidAidCore — first deployable contract for the PaidAid v0 workflow.
// Patterns follow the near-sdk status-message example and NEAR contract anatomy:
// https://docs.near.org/smart-contracts/anatomy/anatomy

use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, BorshStorageKey};

/// Prefix bytes for each collection in contract storage.
///
/// NEAR persists contract state in a trie. Collections from `near_sdk::store` load and
/// save entries individually instead of serializing the whole map on every call.
#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Messages,
}

/// On-chain state for PaidAidCore.
///
/// `#[near(contract_state)]` tells the SDK this struct is the contract's persisted state.
/// Fields must be Borsh-serializable (via derive or manual impl from the SDK).
#[near(contract_state)]
pub struct PaidAidCore {
    /// Per-account messages. Keys are NEAR account IDs (`alice.testnet`, etc.).
    messages: LookupMap<AccountId, String>,
    /// Count of accounts that currently have a stored message (updates do not change this).
    total_messages: u64,
}

impl Default for PaidAidCore {
    fn default() -> Self {
        Self {
            messages: LookupMap::new(StorageKey::Messages),
            total_messages: 0,
        }
    }
}

#[near]
impl PaidAidCore {
    /// Saves `message` for the account that signed this transaction.
    ///
    /// Mutating methods take `&mut self` because they change trie-backed state.
    /// `env::signer_account_id()` is the NEAR account that initiated the call (not the contract).
    pub fn set_message(&mut self, message: String) {
        let account_id = env::signer_account_id();
        let previous = self.messages.insert(account_id, message);
        if previous.is_none() {
            self.total_messages += 1;
        }
    }

    /// Returns the message stored by `account_id`, or `None` when that account has not saved one.
    ///
    /// View methods use `&self` only; the runtime rejects storage writes during view calls.
    pub fn get_message(&self, account_id: AccountId) -> Option<String> {
        self.messages.get(&account_id).cloned()
    }

    /// Returns how many distinct accounts have saved at least one message.
    pub fn get_total_messages(&self) -> u64 {
        self.total_messages
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{testing_env, VMContext};

    fn call_context(signer: &str, is_view: bool) -> VMContext {
        VMContextBuilder::new()
            .signer_account_id(signer.parse().unwrap())
            .is_view(is_view)
            .build()
    }

    /// `store::LookupMap` batches writes until flush/drop; view calls cannot write, so commit
    /// pending map changes before switching to a view context in tests.
    fn commit_messages(contract: &mut PaidAidCore) {
        contract.messages.flush();
    }

    #[test]
    fn total_starts_at_zero() {
        testing_env!(call_context("alice.testnet", true));
        let contract = PaidAidCore::default();
        assert_eq!(contract.get_total_messages(), 0);
    }

    #[test]
    fn get_message_missing_account_returns_none() {
        testing_env!(call_context("alice.testnet", true));
        let contract = PaidAidCore::default();
        assert_eq!(
            contract.get_message("bob.testnet".parse().unwrap()),
            None
        );
    }

    #[test]
    fn set_then_get_message_for_signer() {
        let mut contract = PaidAidCore::default();

        testing_env!(call_context("alice.testnet", false));
        contract.set_message("hello".to_string());
        commit_messages(&mut contract);

        testing_env!(call_context("alice.testnet", true));
        assert_eq!(
            contract.get_message("alice.testnet".parse().unwrap()),
            Some("hello".to_string())
        );
        assert_eq!(contract.get_total_messages(), 1);
    }

    #[test]
    fn set_message_updates_existing_without_increasing_total() {
        let mut contract = PaidAidCore::default();

        testing_env!(call_context("alice.testnet", false));
        contract.set_message("first".to_string());
        contract.set_message("second".to_string());
        commit_messages(&mut contract);

        testing_env!(call_context("alice.testnet", true));
        assert_eq!(
            contract.get_message("alice.testnet".parse().unwrap()),
            Some("second".to_string())
        );
        assert_eq!(contract.get_total_messages(), 1);
    }

    #[test]
    fn multiple_accounts_increase_total_messages() {
        let mut contract = PaidAidCore::default();

        testing_env!(call_context("alice.testnet", false));
        contract.set_message("from alice".to_string());
        commit_messages(&mut contract);

        testing_env!(call_context("bob.testnet", false));
        contract.set_message("from bob".to_string());
        commit_messages(&mut contract);

        testing_env!(call_context("viewer.testnet", true));
        assert_eq!(contract.get_total_messages(), 2);
        assert_eq!(
            contract.get_message("alice.testnet".parse().unwrap()),
            Some("from alice".to_string())
        );
        assert_eq!(
            contract.get_message("bob.testnet".parse().unwrap()),
            Some("from bob".to_string())
        );
    }
}
