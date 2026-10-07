import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as cronGET } from "@/app/api/cron/reminders/route";
import { missingEnv, REQUIRED_ENV } from "@/lib/env";
import { setup } from "./helpers";

const req = (path: string, init: { method?: string; auth?: string; body?: unknown } = {}) =>
  new NextRequest(`http://localhost${path}`, { method: init.method ?? "GET", headers: init.auth ? { authorization: init.auth } : {}, body: init.body ? JSON.stringify(init.body) : undefined });

beforeEach(async () => { await setup(); process.env.CRON_SECRET = "cron-secret"; });
afterEach(() => { delete process.env.CRON_SECRET; });

describe("cron endpoint", () => {
  it("is closed without the exact secret (and without a configured secret)", async () => {
    expect((await cronGET(req("/api/cron/reminders"))).status).toBe(401);
    expect((await cronGET(req("/api/cron/reminders", { auth: "Bearer wrong-secret" }))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await cronGET(req("/api/cron/reminders", { auth: "Bearer " }))).status).toBe(401);
  });

  it("runs the reminder job with the secret", async () => {
    const res = await cronGET(req("/api/cron/reminders", { auth: "Bearer cron-secret" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, reminders24h: 0, reminders1h: 0, releasedHolds: 0, completed: 0 });
  });
});

describe("configuration check", () => {
  it("reports every required variable that is empty (names only)", () => {
    const saved = { ...process.env };
    for (const k of REQUIRED_ENV) delete process.env[k];
    expect(missingEnv()).toEqual([...REQUIRED_ENV]);
    process.env.CRON_SECRET = "x";
    process.env.RESEND_API_KEY = "   ";
    expect(missingEnv()).toContain("RESEND_API_KEY");
    expect(missingEnv()).not.toContain("CRON_SECRET");
    Object.assign(process.env, saved);
  });
});
