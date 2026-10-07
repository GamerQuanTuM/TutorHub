import type { TableName, Tables } from "@/lib/types";
import type { StoredFile } from "@/lib/data/repo";
import { seedStore } from "./seed";

export interface MockStore {
  tables: { [K in TableName]: Tables[K][] };
  files: Map<string, StoredFile>;
}

export const emptyTables = (): MockStore["tables"] => ({
  profiles: [],
  tutor_profiles: [],
  student_profiles: [],
  tutor_students: [],
  availability_rules: [],
  availability_exceptions: [],
  bookings: [],
  lesson_packages: [],
  student_credits: [],
  credit_ledger: [],
  payments: [],
  materials: [],
  material_assignments: [],
  lesson_notes: [],
  assignments: [],
  submissions: [],
  subscriptions: [],
  notifications: [],
  reviews: [],
  messages: [],
  stripe_events: [],
});

export function createStore(seed: boolean): MockStore {
  const store: MockStore = { tables: emptyTables(), files: new Map() };
  if (seed) seedStore(store);
  return store;
}

// Kept on globalThis so every module in a test file shares one store.
const g = globalThis as unknown as { __tutorhubStore?: MockStore };

export function getStore(): MockStore {
  return (g.__tutorhubStore ??= createStore(true));
}

/** Tests call this to start from a clean database. */
export function resetStore(seed = true): MockStore {
  g.__tutorhubStore = createStore(seed);
  return g.__tutorhubStore;
}
