import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// 캠페인 삭제 — 연결된 링크는 campaignId가 null로 떨어짐 (onDelete SetNull)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
