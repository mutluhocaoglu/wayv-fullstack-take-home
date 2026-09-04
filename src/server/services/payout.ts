export function calculatePayout(views: bigint, payoutPer1kViews: number): bigint {
  if (views < 0n) {
    throw new Error("Views cannot be negative.");
  }

  if (!Number.isSafeInteger(payoutPer1kViews) || payoutPer1kViews < 0) {
    throw new Error("Payout per 1k views must be a non-negative integer.");
  }

  return (views / 1_000n) * BigInt(payoutPer1kViews);
}
