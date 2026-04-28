// Google OAuth (server-side) — Analytics Data API readonly scope.
// 환경변수: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI

import { OAuth2Client } from "google-auth-library";

export const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export function getOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google OAuth env vars missing (GOOGLE_OAUTH_CLIENT_ID, _SECRET, _REDIRECT_URI)",
    );
  }
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

export function buildAuthUrl(): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // refresh token 받기
    prompt: "consent", // 매번 refresh token 발급 보장
    scope: [GA_SCOPE, "https://www.googleapis.com/auth/userinfo.email"],
  });
}

export async function exchangeCodeForTokens(code: string): Promise<{
  refreshToken: string;
  accessToken: string;
  expiryDate: number | null;
  email: string | null;
}> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("refresh_token 을 받지 못했습니다. (이미 권한 부여한 계정이면 prompt=consent 강제 필요)");
  }
  client.setCredentials(tokens);

  // 사용자 이메일 가져오기
  let email: string | null = null;
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (res.ok) {
      const j = (await res.json()) as { email?: string };
      email = j.email ?? null;
    }
  } catch {
    // ignore
  }

  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token ?? "",
    expiryDate: tokens.expiry_date ?? null,
    email,
  };
}

export async function getAccessToken(refreshToken: string): Promise<string> {
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  if (!credentials.access_token) throw new Error("refresh failed");
  return credentials.access_token;
}
