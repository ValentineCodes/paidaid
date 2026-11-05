const NEAR_ACCOUNT_ID_PATTERN =
  /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

const IMPLICIT_ACCOUNT_PATTERN = /^[a-f0-9]{64}$/;

export function validateMessage(message: string): string | null {
  if (!message.trim()) {
    return "Message cannot be empty.";
  }
  return null;
}

export function validateAccountId(accountId: string): string | null {
  const trimmed = accountId.trim();
  if (!trimmed) {
    return "Account ID is required.";
  }
  if (trimmed.length < 2 || trimmed.length > 64) {
    return "Account ID must be between 2 and 64 characters.";
  }
  if (
    !NEAR_ACCOUNT_ID_PATTERN.test(trimmed) &&
    !IMPLICIT_ACCOUNT_PATTERN.test(trimmed)
  ) {
    return "Account ID format is invalid.";
  }
  return null;
}

export function normalizeAccountId(accountId: string): string {
  return accountId.trim();
}
