// 단축 URL 리디렉션 + 클릭 트래킹.
// 호출: GET /r/<code>

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashIp } from "@/lib/utm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const link = await prisma.utmLink.findUnique({ where: { shortCode: code } });
  if (!link) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 클릭 기록 (best-effort, fail 시에도 redirect 진행)
  try {
    const headers = req.headers;
    const ipRaw =
      headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      headers.get("x-real-ip") ??
      "unknown";
    const userAgent = headers.get("user-agent") ?? null;
    const referrer = headers.get("referer") ?? null;
    const country = headers.get("x-vercel-ip-country") ?? null;

    await prisma.click.create({
      data: {
        utmLinkId: link.id,
        ipHash: hashIp(ipRaw),
        userAgent: userAgent?.slice(0, 200),
        referrer: referrer?.slice(0, 200),
        country,
      },
    });
  } catch (e) {
    console.error("[shortener] click log failed:", e);
  }

  return NextResponse.redirect(link.longUrl, 302);
}
