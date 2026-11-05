import { setupIntearWallet } from "@near-wallet-selector/intear-wallet";

/**
 * Wallet Selector only accepts preset network ids (mainnet/testnet). The app
 * passes a testnet-shaped preset plus sandbox RPC; Intear still needs networkId
 * `localnet` when opening its connect iframe.
 */
function setupIntearWalletForLocalnet() {
  const factory = setupIntearWallet();
  return async (params: Parameters<typeof factory>[0]) => {
    const walletModule = await factory(params);
    if (!walletModule) {
      return null;
    }
    const baseInit = walletModule.init;
    return {
      ...walletModule,
      init: (initOptions: Parameters<typeof baseInit>[0]) =>
        baseInit({
          ...initOptions,
          options: {
            ...initOptions.options,
            network: {
              ...initOptions.options.network,
              networkId: "localnet",
            },
          },
        }),
    };
  };
}

export function localnetWalletModules() {
  return [setupIntearWalletForLocalnet()];
}
