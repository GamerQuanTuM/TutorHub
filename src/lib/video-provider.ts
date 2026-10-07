import { createHmac, createSign } from "node:crypto";

/**
 * Which Jitsi the lesson room uses. One switch, in the server environment:
 *
 *   VIDEO_PROVIDER=public       meet.jit.si. Free, but only for demos: Jitsi cuts embedded calls after 5 minutes.
 *   VIDEO_PROVIDER=self-hosted  your own Jitsi Meet (the open-source one, e.g. the docker setup in deploy/).
 *                                 JITSI_DOMAIN=video.example.com
 *                                 Optional token login so nobody can open rooms on your server uninvited:
 *                                 JITSI_JWT_APP_ID, JITSI_JWT_APP_SECRET (and JITSI_JWT_SUB, default "meet.jitsi")
 *   VIDEO_PROVIDER=jaas         8x8 Jitsi as a Service (hosted, free up to 25 monthly users). Needs
 *                                 JAAS_APP_ID, JAAS_KEY_ID, JAAS_PRIVATE_KEY (RS256 private key, PEM, newlines as \n)
 *
 * If VIDEO_PROVIDER is unset: a custom JITSI_DOMAIN (or the older NEXT_PUBLIC_JITSI_DOMAIN) means self-hosted, otherwise public.
 * Tokens are created on the server, once per person per page load, and never leave the lesson page.
 */
export type VideoProvider = "public" | "self-hosted" | "jaas";

/** What the browser needs to start the call. `error` is set instead when the chosen provider is not configured. */
export interface VideoConfig {
  provider: VideoProvider;
  domain: string;
  scriptUrl: string;
  roomName: string;
  jwt?: string;
  error?: string;
}

type Env = Record<string, string | undefined>;
const clean = (v: string | undefined) => v?.trim() || undefined;

export function videoProvider(env: Env = process.env): VideoProvider {
  const v = clean(env.VIDEO_PROVIDER)?.toLowerCase();
  if (v === "public" || v === "self-hosted" || v === "jaas") return v;
  const domain = clean(env.JITSI_DOMAIN) ?? clean(env.NEXT_PUBLIC_JITSI_DOMAIN);
  return domain && domain !== "meet.jit.si" ? "self-hosted" : "public";
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

/** Minimal JWT signer (HS256 for self-hosted Jitsi, RS256 for JaaS), so no extra dependency is needed. */
export function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, key: string): string {
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const alg = header.alg;
  if (alg === "HS256") return `${data}.${b64url(createHmac("sha256", key).update(data).digest())}`;
  if (alg === "RS256") return `${data}.${b64url(createSign("RSA-SHA256").update(data).sign(key))}`;
  throw new Error(`Unsupported JWT algorithm: ${String(alg)}`);
}

export interface VideoUser { id: string; name: string; email: string; avatarUrl: string | null }

export function getVideoConfig(
  a: { roomName: string; user: VideoUser; moderator: boolean; recording: boolean },
  env: Env = process.env,
  nowSec: number = Math.floor(Date.now() / 1000),
): VideoConfig {
  const provider = videoProvider(env);
  const exp = nowSec + 4 * 3600; // longer than any lesson; the token only matters when joining
  const nbf = nowSec - 10;
  const user = { id: a.user.id, name: a.user.name, email: a.user.email, avatar: a.user.avatarUrl ?? "" };

  if (provider === "jaas") {
    const appId = clean(env.JAAS_APP_ID);
    const keyId = clean(env.JAAS_KEY_ID);
    const key = clean(env.JAAS_PRIVATE_KEY)?.replace(/\\n/g, "\n");
    if (!appId || !keyId || !key) {
      return { provider, domain: "8x8.vc", scriptUrl: "", roomName: a.roomName, error: "Video is not set up yet (JaaS needs JAAS_APP_ID, JAAS_KEY_ID and JAAS_PRIVATE_KEY)." };
    }
    const jwt = signJwt(
      { alg: "RS256", typ: "JWT", kid: keyId.includes("/") ? keyId : `${appId}/${keyId}` }, // the console may show the key id with or without the app id in front
      {
        aud: "jitsi", iss: "chat", sub: appId, room: a.roomName, iat: nowSec, nbf, exp,
        context: {
          user: { ...user, moderator: a.moderator ? "true" : "false" },
          features: { recording: a.recording ? "true" : "false", livestreaming: "false", transcription: "false", "outbound-call": "false" },
        },
      },
      key,
    );
    return { provider, domain: "8x8.vc", scriptUrl: `https://8x8.vc/${appId}/external_api.js`, roomName: `${appId}/${a.roomName}`, jwt };
  }

  if (provider === "self-hosted") {
    const domain = clean(env.JITSI_DOMAIN) ?? clean(env.NEXT_PUBLIC_JITSI_DOMAIN);
    if (!domain) return { provider, domain: "", scriptUrl: "", roomName: a.roomName, error: "Video is not set up yet (set JITSI_DOMAIN to your Jitsi server)." };
    const appId = clean(env.JITSI_JWT_APP_ID);
    const secret = clean(env.JITSI_JWT_APP_SECRET);
    const jwt = appId && secret
      ? signJwt(
          { alg: "HS256", typ: "JWT" },
          { aud: appId, iss: appId, sub: clean(env.JITSI_JWT_SUB) ?? "meet.jitsi", room: a.roomName, nbf, exp, context: { user: { ...user, moderator: a.moderator } } },
          secret,
        )
      : undefined;
    return { provider, domain, scriptUrl: `https://${domain}/external_api.js`, roomName: a.roomName, jwt };
  }

  return { provider: "public", domain: "meet.jit.si", scriptUrl: "https://meet.jit.si/external_api.js", roomName: a.roomName };
}
