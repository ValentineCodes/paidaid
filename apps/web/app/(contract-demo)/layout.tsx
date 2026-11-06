import { WalletProvider } from "../../wallet/provider";

export default function ContractDemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WalletProvider>{children}</WalletProvider>;
}
