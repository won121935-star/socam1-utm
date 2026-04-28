import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const link = await prisma.utmLink.findUnique({
    where: { id },
    include: { campaign: true },
  });
  if (!link) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // 클릭 통계 — 최근 30일 일별 + 총합
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const clicks = await prisma.click.findMany({
    where: { utmLinkId: id, createdAt: { gte: since } },
    select: { createdAt: true, ipHash: true, referrer: true, country: true },
    orderBy: { createdAt: "asc" },
  });

  const byDay = new Map<string, number>();
  const uniqIps = new Set<string>();
  const byReferrer = new Map<string, number>();
  for (const c of clicks) {
    const day = c.createdAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
    if (c.ipHash) uniqIps.add(c.ipHash);
    const r = (c.referrer ?? "(direct)").slice(0, 60);
    byReferrer.set(r, (byReferrer.get(r) ?? 0) + 1);
  }

  const total = await prisma.click.count({ where: { utmLinkId: id } });

  return NextResponse.json({
    link,
    stats: {
      total,
      last30Days: clicks.length,
      uniqueIps30: uniqIps.size,
      byDay: [...byDay.entries()].map(([date, count]) => ({ date, count })),
      topReferrers: [...byReferrer.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([referrer, count]) => ({ referrer, count })),
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.utmLink.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
