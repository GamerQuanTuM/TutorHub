/**
 * Credit arithmetic. Pure functions, unit-tested, and mirrored by the
 * `adjust_credit` SQL function that Supabase uses for the real atomic update.
 */
export class InsufficientCreditsError extends Error {
  constructor() {
    super("Not enough lesson credits.");
    this.name = "InsufficientCreditsError";
  }
}

/** Deduct `n` credits; throws if the balance would go negative. */
export function deductCredits(balance: number, n = 1): number {
  if (!Number.isInteger(n) || n <= 0) throw new RangeError("Credit amount must be a positive integer.");
  if (balance < n) throw new InsufficientCreditsError();
  return balance - n;
}

export function addCredits(balance: number, n: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new RangeError("Credit amount must be a positive integer.");
  return balance + n;
}
