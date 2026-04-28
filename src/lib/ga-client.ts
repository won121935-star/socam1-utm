// GA 4 Admin API + Data API 호출 헬퍼.
import { getAccessToken } from "./google-auth";

const ADMIN_BASE = "https://analyticsadmin.googleapis.com/v1beta";
const DATA_BASE = "https://analyticsdata.googleapis.com/v1beta";

export interface GaProperty {
  name: string; // "properties/123456"
  displayName: string; // 사용자가 GA에서 정한 이름
  account?: string;
  parent?: string;
  currencyCode?: string;
  timeZone?: string;
}

// 사용자가 접근 가능한 GA 4 property 전체 리스트
export async function listProperties(refreshToken: string): Promise<GaProperty[]> {
  const access = await getAccessToken(refreshToken);
  // accountSummaries 가 한 번에 account+property 다 줌
  const res = await fetch(`${ADMIN_BASE}/accountSummaries?pageSize=200`, {
    headers: { authorization: `Bearer ${access}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GA accountSummaries failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    accountSummaries?: Array<{
      account?: string;
      displayName?: string;
      propertySummaries?: Array<{
        property?: string;
        displayName?: string;
      }>;
    }>;
  };
  const out: GaProperty[] = [];
  for (const a of data.accountSummaries ?? []) {
    for (const p of a.propertySummaries ?? []) {
      if (!p.property) continue;
      out.push({
        name: p.property,
        displayName: `${a.displayName ?? "?"} / ${p.displayName ?? "?"}`,
        account: a.account,
      });
    }
  }
  return out;
}

export interface CampaignMetricRow {
  utmCampaign: string;
  utmSource: string;
  utmMedium: string;
  sessions: number;
  totalUsers: number;
  newUsers: number;
  engagedSessions: number;
  averageSessionDuration: number; // seconds
  bounceRate: number; // 0~1
  conversions: number;
}

// 지정된 property에서 utm_campaign 별 metrics 조회.
// 기간: 최근 30일.
export async function fetchUtmCampaignMetrics(
  refreshToken: string,
  propertyId: string, // "properties/12345" or just "12345"
): Promise<CampaignMetricRow[]> {
  const access = await getAccessToken(refreshToken);
  const propertyName = propertyId.startsWith("properties/")
    ? propertyId
    : `properties/${propertyId}`;
  const body = {
    dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
    dimensions: [
      { name: "sessionCampaignName" },
      { name: "sessionSource" },
      { name: "sessionMedium" },
    ],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "newUsers" },
      { name: "engagedSessions" },
      { name: "averageSessionDuration" },
      { name: "bounceRate" },
      { name: "conversions" },
    ],
    limit: 1000,
  };

  const res = await fetch(`${DATA_BASE}/${propertyName}:runReport`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${access}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GA runReport failed: ${res.status} ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    rows?: Array<{
      dimensionValues?: Array<{ value?: string }>;
      metricValues?: Array<{ value?: string }>;
    }>;
  };
  const rows: CampaignMetricRow[] = [];
  for (const r of data.rows ?? []) {
    const dim = r.dimensionValues ?? [];
    const m = r.metricValues ?? [];
    rows.push({
      utmCampaign: dim[0]?.value ?? "",
      utmSource: dim[1]?.value ?? "",
      utmMedium: dim[2]?.value ?? "",
      sessions: parseInt(m[0]?.value ?? "0", 10),
      totalUsers: parseInt(m[1]?.value ?? "0", 10),
      newUsers: parseInt(m[2]?.value ?? "0", 10),
      engagedSessions: parseInt(m[3]?.value ?? "0", 10),
      averageSessionDuration: parseFloat(m[4]?.value ?? "0"),
      bounceRate: parseFloat(m[5]?.value ?? "0"),
      conversions: parseFloat(m[6]?.value ?? "0"),
    });
  }
  return rows;
}
