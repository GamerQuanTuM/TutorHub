import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_STUDENT_ID, DEMO_TUTOR_ID } from "./support/seed";
import { resetStore } from "./support/store";
import { redirectOf } from "./support/redirect";
import { demoConfig, demoRoles } from "@/lib/demo";

// Replace the real Supabase sign-in so the test can see what the action tries to sign in with
const signIn = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({ auth: { signInWithPassword: signIn, signOut: async () => {} } }) }));
const { demoLoginAction } = await import("@/lib/actions/auth");

const all = {
  DEMO_LOGIN_ENABLED: "true",
  DEMO_TUTOR_EMAIL: "tutor@demo.test", DEMO_TUTOR_PASSWORD: "tutor-pass",
  DEMO_STUDENT_EMAIL: "student@demo.test", DEMO_STUDENT_PASSWORD: "student-pass",
};

describe("demoConfig", () => {
  it("is off unless explicitly enabled", () => {
    expect(demoConfig({})).toEqual({});
    expect(demoConfig({ ...all, DEMO_LOGIN_ENABLED: "yes" })).toEqual({});
    expect(demoConfig({ ...all, DEMO_LOGIN_ENABLED: undefined })).toEqual({});
  });

  it("offers a role only when both its email and password are set", () => {
    expect(demoRoles(all)).toEqual(["tutor", "student"]);
    expect(demoRoles({ ...all, DEMO_STUDENT_PASSWORD: "" })).toEqual(["tutor"]);
    expect(demoRoles({ ...all, DEMO_TUTOR_EMAIL: "  " })).toEqual(["student"]);
  });

  it("is blocked in production unless production use is explicitly allowed", () => {
    expect(demoConfig({ ...all, NODE_ENV: "production" })).toEqual({});
    expect(demoRoles({ ...all, NODE_ENV: "production", DEMO_LOGIN_ALLOW_PRODUCTION: "true" })).toEqual(["tutor", "student"]);
    expect(demoConfig({ ...all, NODE_ENV: "production", DEMO_LOGIN_ALLOW_PRODUCTION: "1" })).toEqual({});
    expect(demoRoles({ ...all, NODE_ENV: "development" })).toEqual(["tutor", "student"]);
  });
});

const form = (role: string) => { const f = new FormData(); f.append("role", role); return f; };
const original = { ...process.env };

beforeEach(() => { resetStore(true); signIn.mockReset(); });
afterEach(() => { process.env = { ...original }; });

describe("demoLoginAction", () => {
  it("does nothing and sends people back to log in when demo login is off", async () => {
    delete process.env.DEMO_LOGIN_ENABLED;
    expect(await redirectOf(() => demoLoginAction(form("tutor")))).toBe("/login?error=demo");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("signs in with the server-side credentials and lands on the right home page", async () => {
    Object.assign(process.env, all);
    signIn.mockResolvedValue({ data: { user: { id: DEMO_TUTOR_ID } }, error: null });
    expect(await redirectOf(() => demoLoginAction(form("tutor")))).toBe("/tutor/dashboard");
    expect(signIn).toHaveBeenCalledWith({ email: "tutor@demo.test", password: "tutor-pass" });

    signIn.mockResolvedValue({ data: { user: { id: DEMO_STUDENT_ID } }, error: null });
    expect(await redirectOf(() => demoLoginAction(form("student")))).toBe("/student/dashboard");
    expect(signIn).toHaveBeenLastCalledWith({ email: "student@demo.test", password: "student-pass" });
  });

  it("ignores anything except the two known roles (credentials can't be chosen from the browser)", async () => {
    Object.assign(process.env, all);
    for (const role of ["admin", "", "tutor@evil.test", "__proto__"]) {
      expect(await redirectOf(() => demoLoginAction(form(role)))).toBe("/login?error=demo");
    }
    const f = form("tutor");
    f.append("email", "victim@x.test"); f.append("password", "guess");
    signIn.mockResolvedValue({ data: { user: { id: DEMO_TUTOR_ID } }, error: null });
    await redirectOf(() => demoLoginAction(f));
    expect(signIn).toHaveBeenCalledWith({ email: "tutor@demo.test", password: "tutor-pass" }); // extra fields are ignored
  });

  it("fails safely when the demo account does not exist or the password is wrong", async () => {
    Object.assign(process.env, all);
    signIn.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } });
    expect(await redirectOf(() => demoLoginAction(form("tutor")))).toBe("/login?error=demo");
  });
});
