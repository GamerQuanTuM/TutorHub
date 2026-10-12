/**
 * The reasons written to the credit ledger. Some of them matter to logic (not just to the history list):
 * credits the tutor gave away for free have no payment behind them, so they can never be refunded to a card.
 */
export const CREDIT_REASON = {
  welcome: "Welcome credits from your tutor",
  addedByTutor: "Added by tutor",
  removedFree: "Free credits removed by tutor",
  booked: "Lesson booked",
  returned: "Lesson cancelled: credit returned",
} as const;

/** Positive ledger entries that were given, not bought. */
export const FREE_GRANT_REASONS: readonly string[] = [CREDIT_REASON.welcome, CREDIT_REASON.addedByTutor];
