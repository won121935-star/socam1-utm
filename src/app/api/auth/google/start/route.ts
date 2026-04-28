import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/google-auth";

export async function GET() {
  try {
    const url = buildAuthUrl();
    return NextResponse.redirect(url);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "오류" },
      { status: 500 },
    );
  }
}
