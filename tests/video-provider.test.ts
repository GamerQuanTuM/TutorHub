import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getVideoConfig, signJwt, videoProvider } from "@/lib/video-provider";
import { embedUrl } from "@/lib/video";

const user = { id: "u1", name: "Ana García", email: "ana@test.dev", avatarUrl: null };
const base = { roomName: "tutorhub-abc", user, moderator: true, recording: false };
const NOW = 1_800_000_000;

const parts = (jwt: string) => {
  const [h, p, s] = jwt.split(".");
  return { header: JSON.parse(Buffer.from(h, "base64url").toString()), payload: JSON.parse(Buffer.from(p, "base64url").toString()), signed: `${h}.${p}`, sig: s };
};

describe("which provider is used", () => {
  it("follows VIDEO_PROVIDER when it is set", () => {
    expect(videoProvider({ VIDEO_PROVIDER: "jaas" })).toBe("jaas");
    expect(videoProvider({ VIDEO_PROVIDER: " Self-Hosted " })).toBe("self-hosted");
    expect(videoProvider({ VIDEO_PROVIDER: "public", JITSI_DOMAIN: "video.example.com" })).toBe("public");
  });
  it("falls back sensibly when it is not set (older setups keep working)", () => {
    expect(videoProvider({})).toBe("public");
    expect(videoProvider({ NEXT_PUBLIC_JITSI_DOMAIN: "meet.jit.si" })).toBe("public");
    expect(videoProvider({ NEXT_PUBLIC_JITSI_DOMAIN: "video.example.com" })).toBe("self-hosted");
    expect(videoProvider({ JITSI_DOMAIN: "video.example.com" })).toBe("self-hosted");
    expect(videoProvider({ VIDEO_PROVIDER: "nonsense" })).toBe("public");
  });
});

describe("public (meet.jit.si)", () => {
  it("uses the public server and no token", () => {
    expect(getVideoConfig(base, { VIDEO_PROVIDER: "public" }, NOW)).toEqual({ provider: "public", domain: "meet.jit.si", scriptUrl: "https://meet.jit.si/external_api.js", roomName: "tutorhub-abc" });
  });
});

describe("self-hosted Jitsi", () => {
  const env = { VIDEO_PROVIDER: "self-hosted", JITSI_DOMAIN: "video.example.com" };

  it("points at your own server, without a token by default", () => {
    const c = getVideoConfig(base, env, NOW);
    expect(c).toMatchObject({ provider: "self-hosted", domain: "video.example.com", scriptUrl: "https://video.example.com/external_api.js", roomName: "tutorhub-abc" });
    expect(c.jwt).toBeUndefined();
    expect(c.error).toBeUndefined();
  });

  it("accepts the older NEXT_PUBLIC_JITSI_DOMAIN name", () => {
    expect(getVideoConfig(base, { VIDEO_PROVIDER: "self-hosted", NEXT_PUBLIC_JITSI_DOMAIN: "old.example.com" }, NOW).domain).toBe("old.example.com");
  });

  it("signs an HS256 token for the room when token login is configured, tutor as moderator", () => {
    const c = getVideoConfig(base, { ...env, JITSI_JWT_APP_ID: "tutorhub", JITSI_JWT_APP_SECRET: "s3cret-s3cret-s3cret" }, NOW);
    const { header, payload, signed, sig } = parts(c.jwt!);
    expect(header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(sig).toBe(createHmac("sha256", "s3cret-s3cret-s3cret").update(signed).digest("base64url"));
    expect(payload).toMatchObject({ aud: "tutorhub", iss: "tutorhub", sub: "meet.jitsi", room: "tutorhub-abc", context: { user: { id: "u1", name: "Ana García", moderator: true } } });
    expect(payload.exp).toBe(NOW + 4 * 3600);
    expect(payload.nbf).toBeLessThan(NOW);
  });

  it("a student is not a moderator", () => {
    const c = getVideoConfig({ ...base, moderator: false }, { ...env, JITSI_JWT_APP_ID: "a", JITSI_JWT_APP_SECRET: "b" }, NOW);
    expect(parts(c.jwt!).payload.context.user.moderator).toBe(false);
  });

  it("reports a clear error instead of crashing when the domain is missing", () => {
    const c = getVideoConfig(base, { VIDEO_PROVIDER: "self-hosted" }, NOW);
    expect(c.error).toMatch(/JITSI_DOMAIN/);
    expect(c.jwt).toBeUndefined();
  });
});

describe("8x8 JaaS", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const env = { VIDEO_PROVIDER: "jaas", JAAS_APP_ID: "vpaas-magic-cookie-123", JAAS_KEY_ID: "key-1", JAAS_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n") }; // as pasted into one env line

  it("uses 8x8's domain, the app-prefixed room and a token that verifies against the public key", () => {
    const c = getVideoConfig({ ...base, recording: true }, env, NOW);
    expect(c).toMatchObject({ provider: "jaas", domain: "8x8.vc", scriptUrl: "https://8x8.vc/vpaas-magic-cookie-123/external_api.js", roomName: "vpaas-magic-cookie-123/tutorhub-abc" });
    const { header, payload, signed, sig } = parts(c.jwt!);
    expect(header).toEqual({ alg: "RS256", typ: "JWT", kid: "vpaas-magic-cookie-123/key-1" });
    expect(createVerify("RSA-SHA256").update(signed).verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true);
    expect(payload).toMatchObject({ aud: "jitsi", iss: "chat", sub: "vpaas-magic-cookie-123", room: "tutorhub-abc" });
    expect(payload.context.user).toMatchObject({ id: "u1", name: "Ana García", email: "ana@test.dev", moderator: "true" });
    expect(payload.context.features.recording).toBe("true");
  });

  it("accepts the key id with or without the app id in front of it", () => {
    const withPrefix = getVideoConfig(base, { ...env, JAAS_KEY_ID: "vpaas-magic-cookie-123/key-1" }, NOW);
    expect(parts(withPrefix.jwt!).header.kid).toBe("vpaas-magic-cookie-123/key-1");
  });

  it("does not offer recording or moderation to a student", () => {
    const { payload } = parts(getVideoConfig({ ...base, moderator: false, recording: false }, env, NOW).jwt!);
    expect(payload.context.user.moderator).toBe("false");
    expect(payload.context.features.recording).toBe("false");
  });

  it("tells you which settings are missing instead of failing", () => {
    for (const missing of ["JAAS_APP_ID", "JAAS_KEY_ID", "JAAS_PRIVATE_KEY"] as const) {
      const c = getVideoConfig(base, { ...env, [missing]: undefined }, NOW);
      expect(c.error).toMatch(/JAAS_APP_ID, JAAS_KEY_ID and JAAS_PRIVATE_KEY/);
      expect(c.jwt).toBeUndefined();
    }
  });
});

describe("signJwt", () => {
  it("refuses unknown algorithms", () => {
    expect(() => signJwt({ alg: "none" }, {}, "k")).toThrow(/Unsupported/);
  });
});

describe("embedUrl (tutor intro video)", () => {
  it("turns YouTube and Vimeo links into embeds and rejects anything else", () => {
    expect(embedUrl("https://www.youtube.com/watch?v=abc123")).toBe("https://www.youtube-nocookie.com/embed/abc123");
    expect(embedUrl("https://youtu.be/abc123")).toBe("https://www.youtube-nocookie.com/embed/abc123");
    expect(embedUrl("https://vimeo.com/12345")).toBe("https://player.vimeo.com/video/12345");
    expect(embedUrl("https://example.com/video")).toBeNull();
    expect(embedUrl("https://youtube.com/watch")).toBeNull();
    expect(embedUrl("not a url")).toBeNull();
    expect(embedUrl(null)).toBeNull();
  });
});
