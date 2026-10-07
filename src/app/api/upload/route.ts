import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getAdminRepo } from "@/lib/data";
import { UPLOAD_LIMITS } from "@/lib/validation/schemas";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST multipart/form-data { file, kind }.
 * kind: "avatar" (images only, public) | "file" (materials, homework attachments, submissions).
 * Validates size and MIME type server-side, then stores under the uploader's own folder.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const rl = rateLimit(`upload:${session.id}`, 40, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });

  const form = await request.formData();
  const file = form.get("file");
  const kind = form.get("kind") === "avatar" ? "avatar" : "file";
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });

  if (file.size === 0 || file.size > UPLOAD_LIMITS.maxBytes)
    return NextResponse.json({ error: `Files must be under ${UPLOAD_LIMITS.maxBytes / 1024 / 1024} MB.` }, { status: 413 });
  const allowed: readonly string[] = kind === "avatar" ? UPLOAD_LIMITS.mimes.filter((m) => m.startsWith("image/")) : UPLOAD_LIMITS.mimes;
  if (!allowed.includes(file.type))
    return NextResponse.json({ error: kind === "avatar" ? "Photos must be PNG, JPG, WebP or GIF." : "Allowed types: PDF, images (PNG/JPG/WebP/GIF) and audio (MP3/M4A/WAV/OGG)." }, { status: 415 });

  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${kind === "avatar" ? `avatars/${session.id}` : session.id}/${randomUUID()}-${safeName}`;
  await getAdminRepo().putFile(path, new Uint8Array(await file.arrayBuffer()), file.type, file.name);

  return NextResponse.json({ path, name: file.name, size: file.size, mime: file.type, url: `/api/files/${path}` });
}
