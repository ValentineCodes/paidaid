type AppShellProps = {
  children: React.ReactNode;
};

/**
 * Root layout shell. Marketplace routes use `(main)/layout` for the header.
 * The `/contract` demo uses `(contract-demo)/layout` for WalletProvider.
 */
export function AppShell({ children }: AppShellProps) {
  return <>{children}</>;
}
