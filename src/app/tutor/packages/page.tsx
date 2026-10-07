import { PackagesManager, type PackageItem } from "@/components/packages/packages-manager";
import { PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { formatMoney } from "@/lib/time";

export const metadata = { title: "Packages · TutorHub" };

const symbols: Record<string, string> = { eur: "€", usd: "$", gbp: "£" };

export default async function PackagesPage() {
  const session = await requireSession("tutor");
  const repo = await getRepo();
  const [tutor, packages, payments] = await Promise.all([repo.one("tutor_profiles", { userId: session.id }), repo.select("lesson_packages", { tutorId: session.id }), repo.select("payments", { tutorId: session.id })]);
  if (!tutor) return null;
  const hourly = tutor.hourlyPriceCents;

  const items: PackageItem[] = packages.map((p) => {
    const normal = hourly * p.lessonCount; // price of the same number of 60-min lessons
    return {
      id: p.id, name: p.name, lessonCount: p.lessonCount, priceLabel: formatMoney(p.priceCents, p.currency),
      perLessonLabel: formatMoney(Math.round(p.priceCents / p.lessonCount), p.currency),
      saving: normal > p.priceCents ? Math.round((1 - p.priceCents / normal) * 100) : 0, active: p.active,
      sold: payments.filter((x) => x.packageId === p.id && x.status !== "failed" && x.status !== "pending").length,
    };
  });
  return (
    <>
      <PageHeader title="Lesson packages" subtitle={`Your hourly rate is ${formatMoney(hourly, tutor.currency)}. Discounts are calculated against it.`} />
      <PackagesManager packages={items} currencySymbol={symbols[tutor.currency] ?? tutor.currency.toUpperCase()} hourlyCents={hourly} />
    </>
  );
}
