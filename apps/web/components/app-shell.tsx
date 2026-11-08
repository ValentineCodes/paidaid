type AppShellProps = {
  children: React.ReactNode;
};

/** Root shell wrapper (theme bootstrap runs via `next/script` in `app/layout.tsx`). */
export function AppShell({ children }: AppShellProps) {
  return children;
}
