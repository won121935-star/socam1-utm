// UTM 파라미터로 풀 URL 만들기 + 단축 코드 생성

export interface UtmInput {
  baseUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm?: string;
  utmContent?: string;
}

export function buildUtmUrl(input: UtmInput): string {
  const url = new URL(input.baseUrl);
  url.searchParams.set("utm_source", input.utmSource);
  url.searchParams.set("utm_medium", input.utmMedium);
  url.searchParams.set("utm_campaign", input.utmCampaign);
  if (input.utmTerm) url.searchParams.set("utm_term", input.utmTerm);
  if (input.utmContent) url.searchParams.set("utm_content", input.utmContent);
  return url.toString();
}

const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // 헷갈리는 0/O/1/l 제외

export function randomShortCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function hashIp(ip: string, salt = "socam1-utm"): string {
  // 간단한 deterministic 해시 (Node crypto 없이 edge 호환)
  let h = 0;
  const s = ip + salt;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
