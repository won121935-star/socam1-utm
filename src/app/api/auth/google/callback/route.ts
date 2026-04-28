import { NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/google-auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const baseUrl = new URL(req.url);
  baseUrl.pathname = "/settings";
  baseUrl.search = "";

  if (error) {
    baseUrl.searchParams.set("error", error);
    return NextResponse.redirect(baseUrl.toString());
  }
  if (!code) {
    baseUrl.searchParams.set("error", "no_code");
    return NextResponse.redirect(baseUrl.toString());
  }

  try {
    const { refreshToken, email } = await exchangeCodeForTokens(code);
    // 단일 팀: 기존 연결 있으면 갈음
    const existing = await prisma.gaConnection.findFirst();
    if (existing) {
      await prisma.gaConnection.update({
        where: { id: existing.id },
        data: {
          accountEmail: email ?? existing.accountEmail,
          refreshToken,
          // property 는 사용자가 다시 선택하도록 비움 (다른 계정이면)
          ...(email && existing.accountEmail !== email
            ? { propertyId: null, propertyName: null }
            : {}),
        },
      });
    } else {
      await prisma.gaConnection.create({
        data: {
          accountEmail: email ?? "unknown",
          refreshToken,
        },
      });
    }
    baseUrl.searchParams.set("connected", "1");
    return NextResponse.redirect(baseUrl.toString());
  } catch (e) {
    baseUrl.searchParams.set(
      "error",
      e instanceof Error ? e.message : "callback_error",
    );
    return NextResponse.redirect(baseUrl.toString());
  }
}
