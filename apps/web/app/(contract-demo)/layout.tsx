import { readNearPublicEnv } from "../../lib/near/near-public-env";
import { WalletProvider } from "../../wallet/provider";

export default function ContractDemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WalletProvider nearPublicEnv={readNearPublicEnv()}>
      {children}
    </WalletProvider>
  );
}
