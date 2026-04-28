import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { buildUtmUrl, randomShortCode } from "@/lib/utm";

// GET /api/links?campaign=...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaign");

  const links = await prisma.utmLink.findMany({
    where: campaignId ? { campaignId } : {},
    include: {
      campaign: { select: { id: true, name: true } },
      _count: { select: { clicks: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    links: links.map((l) => ({
      id: l.id,
      shortCode: l.shortCode,
      longUrl: l.longUrl,
      baseUrl: l.baseUrl,
      utmSource: l.utmSource,
      utmMedium: l.utmMedium,
      utmCampaign: l.utmCampaign,
      utmTerm: l.utmTerm,
      utmContent: l.utmContent,
      label: l.label,
      createdBy: l.createdBy,
      createdAt: l.createdAt.toISOString(),
      campaign: l.campaign,
      clickCount: l._count.clicks,
    })),
  });
}

const createSchema = z.object({
  baseUrl: z.string().url(),
  utmSource: z.string().min(1).max(64),
  utmMedium: z.string().min(1).max(64),
  utmCampaign: z.string().min(1).max(80),
  utmTerm: z.string().max(80).optional(),
  utmContent: z.string().max(80).optional(),
  campaignName: z.string().max(80).optional(),
  label: z.string().max(120).optional(),
  createdBy: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const longUrl = buildUtmUrl(d);

  // 캠페인 upsert (이름으로)
  let campaignId: string | undefined;
  if (d.campaignName?.trim()) {
    const c = await prisma.campaign.upsert({
      where: { name: d.campaignName.trim() },
      update: {},
      create: { name: d.campaignName.trim() },
    });
    campaignId = c.id;
  }

  // 충돌 안 나는 단축 코드
  let shortCode = randomShortCode();
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.utmLink.findUnique({ where: { shortCode } });
    if (!exists) break;
    shortCode = randomShortCode();
  }

  const link = await prisma.utmLink.create({
    data: {
      campaignId,
      baseUrl: d.baseUrl,
      utmSource: d.utmSource,
      utmMedium: d.utmMedium,
      utmCampaign: d.utmCampaign,
      utmTerm: d.utmTerm,
      utmContent: d.utmContent,
      longUrl,
      shortCode,
      label: d.label,
      createdBy: d.createdBy,
    },
    include: { campaign: true },
  });

  return NextResponse.json({ link });
}
