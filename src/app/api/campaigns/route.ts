import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// 링크 0개인 빈 캠페인은 응답에서 제외 (자동 정리 효과)
export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    include: { _count: { select: { links: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    campaigns: campaigns
      .map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        startDate: c.startDate?.toISOString().slice(0, 10) ?? null,
        endDate: c.endDate?.toISOString().slice(0, 10) ?? null,
        linkCount: c._count.links,
      }))
      .filter((c) => c.linkCount > 0),
  });
}
