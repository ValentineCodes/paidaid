export function formatWalletConnectionError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (/user rejected|cancel|closed/i.test(message)) {
      return "Connection cancelled.";
    }
    if (message) {
      return message;
    }
  }
  return "Could not connect wallet. Try again.";
}
