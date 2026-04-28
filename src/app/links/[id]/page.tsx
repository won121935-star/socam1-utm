"use client";

import { useEffect, useState, use } from "react";
import { ArrowLeft, ExternalLink, Copy, Check, BarChart3, LineChart } from "lucide-react";
import Link from "next/link";

type Stats = {
  total: number;
  last30Days: number;
  uniqueIps30: number;
  byDay: { date: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
};

type LinkDetail = {
  id: string;
  shortCode: string;
  longUrl: string;
  baseUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string | null;
  utmContent: string | null;
  label: string | null;
  campaign: { id: string; name: string } | null;
  createdBy: string | null;
  createdAt: string;
};

type GaRow = {
  utmCampaign: string;
  utmSource: string;
  utmMedium: string;
  sessions: number;
  totalUsers: number;
  newUsers: number;
  engagedSessions: number;
  averageSessionDuration: number;
  bounceRate: number;
  conversions: number;
};

type GaState =
  | { connected: false }
  | {
      connected: true;
      propertyName?: string | null;
      rows: GaRow[];
      error?: string;
    };

export default function LinkDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [link, setLink] = useState<LinkDetail | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [ga, setGa] = useState<GaState | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/links/${id}`);
      if (!res.ok) return;
      const json = await res.json();
      setLink(json.link);
      setStats(json.stats);
    })();
  }, [id]);

  // 링크 정보 받아오면 GA 데이터도 fetch
  useEffect(() => {
    if (!link) return;
    void (async () => {
      const params = new URLSearchParams({
        utm_campaign: link.utmCampaign,
        utm_source: link.utmSource,
        utm_medium: link.utmMedium,
      });
      const res = await fetch(`/api/ga/report?${params}`);
      if (!res.ok) {
        setGa({ connected: false });
        return;
      }
      setGa(await res.json());
    })();
  }, [link]);

  if (!link) {
    return (
      <main className="mx-auto max-w-4xl p-8 text-sm text-zinc-400">
        불러오는 중…
      </main>
    );
  }

  const shortUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/r/${link.shortCode}`;

  async function copyShort() {
    await navigator.clipboard.writeText(shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const maxDay = stats ? Math.max(1, ...stats.byDay.map((d) => d.count)) : 1;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-4 md:p-8">
      <header className="flex items-center gap-2 text-sm">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700"
        >
          <ArrowLeft size={12} /> 목록으로
        </Link>
      </header>

      {/* 링크 정보 */}
      <section className="rounded-2xl bg-zinc-900 p-5 ring-1 ring-zinc-800">
        {link.label && (
          <h2 className="mb-2 text-lg font-semibold text-zinc-100">{link.label}</h2>
        )}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          {link.campaign && (
            <span className="rounded-full bg-purple-900/40 px-2 py-0.5 text-purple-200 ring-1 ring-purple-800/50">
              📁 {link.campaign.name}
            </span>
          )}
          <span className="rounded-full bg-zinc-800 px-2 py-0.5">
            {link.utmSource} / {link.utmMedium}
          </span>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5">{link.utmCampaign}</span>
          {link.utmContent && (
            <span className="rounded-full bg-zinc-800 px-2 py-0.5">{link.utmContent}</span>
          )}
          {link.utmTerm && (
            <span className="rounded-full bg-zinc-800 px-2 py-0.5">{link.utmTerm}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-zinc-950 px-2 py-1 text-xs text-emerald-300">
            {shortUrl}
          </code>
          <button
            type="button"
            onClick={copyShort}
            className={
              copied
                ? "inline-flex items-center gap-1 rounded-full bg-emerald-700 px-2.5 py-1 text-xs text-white"
                : "inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-1 text-xs hover:bg-zinc-700"
            }
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "복사됨" : "복사"}
          </button>
          <a
            href={link.longUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-1 text-xs hover:bg-zinc-700"
          >
            <ExternalLink size={12} /> 원본 열기
          </a>
        </div>
        <div className="mt-2 break-all text-[11px] text-zinc-600">→ {link.longUrl}</div>
      </section>

      {/* 통계 */}
      {stats && (
        <>
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Stat label="총 클릭" value={stats.total} />
            <Stat label="최근 30일" value={stats.last30Days} />
            <Stat label="고유 사용자 (30d)" value={stats.uniqueIps30} hint="IP 해시 기준" />
          </section>

          {/* 일별 차트 — 단순 막대 */}
          <section className="rounded-2xl bg-zinc-900 p-5 ring-1 ring-zinc-800">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <BarChart3 size={14} /> 최근 30일 클릭 추이
            </h3>
            {stats.byDay.length === 0 ? (
              <p className="text-sm text-zinc-500">아직 클릭이 없습니다.</p>
            ) : (
              <div className="flex h-32 items-end gap-1">
                {stats.byDay.map((d) => (
                  <div
                    key={d.date}
                    className="flex flex-1 flex-col items-center justify-end gap-1"
                    title={`${d.date} — ${d.count} 클릭`}
                  >
                    <div className="text-[9px] text-zinc-600">{d.count}</div>
                    <div
                      className="w-full rounded bg-blue-500/60 transition hover:bg-blue-500"
                      style={{ height: `${(d.count / maxDay) * 100}%` }}
                    />
                    <div className="text-[8px] text-zinc-600">
                      {d.date.slice(5)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 유입 referrer */}
          <section className="rounded-2xl bg-zinc-900 p-5 ring-1 ring-zinc-800">
            <h3 className="mb-3 text-sm font-semibold text-zinc-300">유입 referrer Top 10</h3>
            {stats.topReferrers.length === 0 ? (
              <p className="text-sm text-zinc-500">아직 데이터가 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {stats.topReferrers.map((r) => (
                  <li
                    key={r.referrer}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <code className="truncate text-zinc-300">{r.referrer}</code>
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-400">
                      {r.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Google Analytics 섹션 */}
      <section className="rounded-2xl bg-zinc-900 p-5 ring-1 ring-zinc-800">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <LineChart size={14} className="text-orange-400" /> Google Analytics (랜딩 후 행동)
        </h3>
        {!ga ? (
          <p className="text-sm text-zinc-500">불러오는 중…</p>
        ) : !ga.connected ? (
          <p className="text-sm text-zinc-400">
            GA 연결되지 않았습니다.{" "}
            <Link href="/settings" className="text-blue-400 underline">
              설정에서 연결
            </Link>
            하면 이 캠페인의 세션·체류시간·전환수가 여기 표시됩니다.
          </p>
        ) : ga.rows.length === 0 ? (
          <div>
            <p className="text-sm text-zinc-500">
              {ga.propertyName ? `${ga.propertyName} — ` : ""}최근 30일 동안 GA 4 에서 이 utm_campaign 으로
              집계된 세션이 없습니다.
            </p>
            {ga.error && (
              <p className="mt-2 text-xs text-red-400">에러: {ga.error}</p>
            )}
          </div>
        ) : (
          <>
            {ga.propertyName && (
              <p className="mb-3 text-[11px] text-zinc-500">속성: {ga.propertyName}</p>
            )}
            {ga.rows.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-800/50 p-3 md:grid-cols-4"
              >
                <GaStat label="세션" value={r.sessions} />
                <GaStat label="사용자" value={r.totalUsers} />
                <GaStat label="신규" value={r.newUsers} />
                <GaStat label="참여 세션" value={r.engagedSessions} />
                <GaStat
                  label="평균 체류 (초)"
                  value={Math.round(r.averageSessionDuration)}
                />
                <GaStat
                  label="이탈률"
                  value={Math.round(r.bounceRate * 100)}
                  suffix="%"
                />
                <GaStat label="전환" value={Math.round(r.conversions)} />
              </div>
            ))}
          </>
        )}
      </section>
    </main>
  );
}

function GaStat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div>
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="text-base font-semibold text-zinc-100">
        {value.toLocaleString()}
        {suffix}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-100">
        {value.toLocaleString()}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-zinc-600">{hint}</div>}
    </div>
  );
}
