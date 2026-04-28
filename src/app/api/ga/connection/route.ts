import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { listProperties } from "@/lib/ga-client";

// GET /api/ga/connection — 현재 연결 상태 + 가능한 property 리스트
export async function GET() {
  const conn = await prisma.gaConnection.findFirst();
  if (!conn) {
    return NextResponse.json({ connected: false });
  }
  let properties: { name: string; displayName: string }[] = [];
  try {
    properties = await listProperties(conn.refreshToken);
  } catch (e) {
    console.error("[ga] listProperties:", e);
  }
  return NextResponse.json({
    connected: true,
    accountEmail: conn.accountEmail,
    propertyId: conn.propertyId,
    propertyName: conn.propertyName,
    properties,
  });
}

const patchSchema = z.object({
  propertyId: z.string().min(1),
  propertyName: z.string().min(1),
});

// PATCH — property 선택
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const conn = await prisma.gaConnection.findFirst();
  if (!conn) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }
  await prisma.gaConnection.update({
    where: { id: conn.id },
    data: {
      propertyId: parsed.data.propertyId,
      propertyName: parsed.data.propertyName,
    },
  });
  return NextResponse.json({ ok: true });
}

// DELETE — 연결 해제
export async function DELETE() {
  const conn = await prisma.gaConnection.findFirst();
  if (conn) await prisma.gaConnection.delete({ where: { id: conn.id } });
  return NextResponse.json({ ok: true });
}
