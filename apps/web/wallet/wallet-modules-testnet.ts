import { setupIntearWallet } from "@near-wallet-selector/intear-wallet";

/** Standard Intear module for explicit testnet configuration (no localnet override). */
export function testnetWalletModules() {
  return [setupIntearWallet()];
}
