import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { buildUtmUrl } from "@/lib/utm";

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

const patchSchema = z.object({
  baseUrl: z.string().url().optional(),
  utmSource: z.string().min(1).max(64).optional(),
  utmMedium: z.string().min(1).max(64).optional(),
  utmCampaign: z.string().min(1).max(80).optional(),
  utmTerm: z.string().max(80).nullable().optional(),
  utmContent: z.string().max(80).nullable().optional(),
  campaignName: z.string().max(80).nullable().optional(), // null이면 캠페인 그룹 제거
  campaignStartDate: z.string().nullable().optional(),
  campaignEndDate: z.string().nullable().optional(),
  label: z.string().max(120).nullable().optional(),
  createdBy: z.string().max(40).nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const existing = await prisma.utmLink.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // UTM 관련 필드가 바뀌면 longUrl 재계산
  const merged = {
    baseUrl: d.baseUrl ?? existing.baseUrl,
    utmSource: d.utmSource ?? existing.utmSource,
    utmMedium: d.utmMedium ?? existing.utmMedium,
    utmCampaign: d.utmCampaign ?? existing.utmCampaign,
    utmTerm:
      d.utmTerm === null
        ? undefined
        : (d.utmTerm ?? existing.utmTerm ?? undefined),
    utmContent:
      d.utmContent === null
        ? undefined
        : (d.utmContent ?? existing.utmContent ?? undefined),
  };
  const longUrl = buildUtmUrl(merged);

  // 캠페인 처리: null 이면 분리, 이름 있으면 upsert
  let campaignId: string | null | undefined;
  if (d.campaignName === null) {
    campaignId = null;
  } else if (d.campaignName?.trim()) {
    const startDate = d.campaignStartDate
      ? new Date(d.campaignStartDate)
      : undefined;
    const endDate = d.campaignEndDate ? new Date(d.campaignEndDate) : undefined;
    const c = await prisma.campaign.upsert({
      where: { name: d.campaignName.trim() },
      update: {
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      },
      create: {
        name: d.campaignName.trim(),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      },
    });
    campaignId = c.id;
  }

  const updated = await prisma.utmLink.update({
    where: { id },
    data: {
      baseUrl: merged.baseUrl,
      utmSource: merged.utmSource,
      utmMedium: merged.utmMedium,
      utmCampaign: merged.utmCampaign,
      utmTerm: merged.utmTerm ?? null,
      utmContent: merged.utmContent ?? null,
      longUrl,
      ...(campaignId !== undefined ? { campaignId } : {}),
      ...(d.label !== undefined ? { label: d.label } : {}),
      ...(d.createdBy !== undefined ? { createdBy: d.createdBy } : {}),
    },
    include: { campaign: true },
  });

  return NextResponse.json({ link: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.utmLink.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
