/** What next/navigation's redirect() throws in tests, so we can assert where an action sent the user. */
export class Redirect extends Error {
  constructor(public url: string) {
    super(`REDIRECT ${url}`);
  }
}

export async function redirectOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof Redirect) return e.url;
    throw e;
  }
  throw new Error("expected a redirect");
}
