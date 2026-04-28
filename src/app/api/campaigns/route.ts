import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    include: { _count: { select: { links: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      linkCount: c._count.links,
    })),
  });
}
