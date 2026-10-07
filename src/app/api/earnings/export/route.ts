import { NextResponse, type NextRequest } from "next/server";
import { DateTime } from "luxon";
import { getSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { earningsCsv, type LedgerRow } from "@/lib/earnings";

/** Downloads the signed-in tutor's payments (paid and refunded) as a CSV file. Tutors only; always their own data. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.profile.role !== "tutor") return NextResponse.redirect(new URL("/login", request.url));

  const repo = await getRepo();
  const [payments, packages] = await Promise.all([repo.select("payments", { tutorId: session.id }), repo.select("lesson_packages", { tutorId: session.id })]);
  const real = payments.filter((p) => p.status === "paid" || p.status === "refunded");

  const names = new Map<string, string>();
  for (const p of real) if (!names.has(p.studentId)) names.set(p.studentId, (await repo.one("profiles", { id: p.studentId }))?.fullName ?? "Student");

  const rows: LedgerRow[] = real.map((payment) => ({
    payment,
    studentName: names.get(payment.studentId) ?? "Student",
    packageName: payment.packageId ? packages.find((k) => k.id === payment.packageId)?.name ?? "Package" : null,
  }));

  const stamp = DateTime.now().setZone(session.profile.timezone).toFormat("yyyy-MM-dd");
  return new NextResponse(earningsCsv(rows, session.profile.timezone), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tutorhub-earnings-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
