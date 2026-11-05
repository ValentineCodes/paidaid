/** Minimum balance to attempt a contract call (≈0.001 NEAR for gas). */
export const MIN_SUBMIT_BALANCE_YOCTO = BigInt("1000000000000000000000");

export function formatTransactionError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Transaction failed.";

  if (/Cannot convert .* to a BigInt/i.test(message)) {
    return `${message} Hard-refresh the page and try again.`;
  }

  if (
    /insufficient|not enough|doesn't have enough|lack.*balance/i.test(message)
  ) {
    return `${message} Fund this account on localnet (create or top up in Intear with RPC http://127.0.0.1:3030).`;
  }

  return message;
}

const YOCTO_PER_NEAR = BigInt("1000000000000000000000000");
const YOCTO_PER_MILLI_NEAR = BigInt("1000000000000000000000");

export function formatYoctoNearBalance(amount: bigint): string {
  const whole = amount / YOCTO_PER_NEAR;
  const milli = (amount % YOCTO_PER_NEAR) / YOCTO_PER_MILLI_NEAR;
  if (milli === BigInt(0)) {
    return `${whole} NEAR`;
  }
  return `${whole}.${milli.toString().padStart(3, "0")} NEAR`;
}
