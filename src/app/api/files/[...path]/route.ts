import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getAdminRepo } from "@/lib/data";
import { canReadFile } from "@/lib/files";

/** Download endpoint: access is checked on the server for every request. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  const path = parts.map(decodeURIComponent).join("/");
  const session = await getSession();
  const repo = getAdminRepo();

  const user = session ? { id: session.id, role: session.profile.role } : null;
  if (!(await canReadFile(repo, user, path))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Hand out a 60-second signed URL (the browser then downloads straight from Supabase Storage)
  const signed = await repo.signedFileUrl(path, 60);
  if (signed) return NextResponse.redirect(signed);

  const file = await repo.getFile(path);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`,
      "Cache-Control": path.startsWith("avatars/") ? "public, max-age=3600" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
