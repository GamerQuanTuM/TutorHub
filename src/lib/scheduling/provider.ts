/**
 * Swap point for external schedulers (e.g. Cal.com).
 * The rest of the app only calls `getSlots` through this interface; the native
 * implementation lives in ./native-provider.ts.
 */
export interface SlotQuery {
  tutorId: string;
  durationMin: number;
  rangeStart: string; // UTC ISO
  rangeEnd: string; // UTC ISO
}

export interface SlotProvider {
  /** Slot start times (UTC ISO) a student could book right now. */
  getSlots(query: SlotQuery): Promise<string[]>;
}
