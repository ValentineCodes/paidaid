import { ThemeScript } from "./theme-script";

type AppShellProps = {
  children: React.ReactNode;
};

/**
 * Root shell: `body` gets `.app` (+ optional `.dark`) from {@link ThemeScript}.
 * Main routes wrap content in Figma `.app` styles via `body` class.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <>
      <ThemeScript />
      {children}
    </>
  );
}
