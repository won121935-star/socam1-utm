import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchUtmCampaignMetrics } from "@/lib/ga-client";

// GET /api/ga/report?utm_campaign=...&utm_source=...&utm_medium=...
// 일치하는 캠페인 GA metrics 반환. 매개변수 없으면 전체 반환.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const utmCampaign = searchParams.get("utm_campaign");
  const utmSource = searchParams.get("utm_source");
  const utmMedium = searchParams.get("utm_medium");

  const conn = await prisma.gaConnection.findFirst();
  if (!conn || !conn.propertyId) {
    return NextResponse.json({ connected: false, rows: [] });
  }

  try {
    const allRows = await fetchUtmCampaignMetrics(
      conn.refreshToken,
      conn.propertyId,
    );
    const filtered = allRows.filter(
      (r) =>
        (!utmCampaign || r.utmCampaign === utmCampaign) &&
        (!utmSource || r.utmSource === utmSource) &&
        (!utmMedium || r.utmMedium === utmMedium),
    );
    return NextResponse.json({
      connected: true,
      propertyName: conn.propertyName,
      rows: filtered,
    });
  } catch (e) {
    return NextResponse.json(
      {
        connected: true,
        rows: [],
        error: e instanceof Error ? e.message : "ga_error",
      },
      { status: 500 },
    );
  }
}
