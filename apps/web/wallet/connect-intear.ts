import type {
  InjectedWallet,
  WalletSelector,
} from "@near-wallet-selector/core";

const INTEAR_WALLET_ID = "intear-wallet";

export function assertIntearWalletModule(selector: WalletSelector): void {
  const hasIntear = selector.store
    .getState()
    .modules.some((module) => module.id === INTEAR_WALLET_ID);
  if (!hasIntear) {
    throw new Error(
      "Intear Wallet did not load. Hard-refresh (Cmd+Shift+R), then try again. If it still fails, restart pnpm dev and clear site data for localhost.",
    );
  }
}

/** Active NEAR account from Wallet Selector store (source of truth after Intear sign-in). */
export function readSelectorAccountId(
  selector: WalletSelector,
): string | null {
  const { accounts } = selector.store.getState();
  if (!accounts?.length) {
    return null;
  }
  const active = accounts.find(
    (entry) => (entry as { active?: boolean }).active === true,
  );
  return active?.accountId ?? accounts[0]?.accountId ?? null;
}

export async function signInWithIntearWallet(
  selector: WalletSelector,
  contractId: string | undefined,
): Promise<string | null> {
  assertIntearWalletModule(selector);
  const intearModule = selector.store
    .getState()
    .modules.find((module) => module.id === INTEAR_WALLET_ID);
  if (!intearModule) {
    throw new Error("Intear Wallet is not available.");
  }
  const wallet = (await intearModule.wallet()) as InjectedWallet;
  await wallet.signIn({ contractId, methodNames: [] });
  return readSelectorAccountId(selector);
}
