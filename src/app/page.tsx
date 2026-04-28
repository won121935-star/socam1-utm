"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Link2,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  BarChart3,
  ChevronDown,
  Settings as SettingsIcon,
} from "lucide-react";
import NextLink from "next/link";
import { cn } from "@/lib/cn";

type CampaignSummary = { id: string; name: string; description: string | null; linkCount: number };

type LinkRow = {
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
  createdBy: string | null;
  createdAt: string;
  campaign: { id: string; name: string } | null;
  clickCount: number;
};

const PRESET_SOURCES = [
  "instagram",
  "facebook",
  "kakao",
  "naver",
  "google",
  "youtube",
  "tiktok",
  "newsletter",
  "blog",
];
const PRESET_MEDIUMS = ["social", "email", "cpc", "display", "referral", "story", "feed", "dm", "banner"];

export default function Home() {
  const [baseUrl, setBaseUrl] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmTerm, setUtmTerm] = useState("");
  const [utmContent, setUtmContent] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [label, setLabel] = useState("");
  const [createdBy, setCreatedBy] = useState(
    typeof window !== "undefined"
      ? window.localStorage.getItem("utm:author") ?? ""
      : "",
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [links, setLinks] = useState<LinkRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<"none" | "campaign">("none");

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("utm:author", createdBy);
    }
  }, [createdBy]);

  const refreshLinks = useCallback(async () => {
    const params = new URLSearchParams();
    if (activeCampaign) params.set("campaign", activeCampaign);
    const res = await fetch(`/api/links?${params}`);
    if (!res.ok) return;
    const json = (await res.json()) as { links: LinkRow[] };
    setLinks(json.links);
  }, [activeCampaign]);

  const refreshCampaigns = useCallback(async () => {
    const res = await fetch("/api/campaigns");
    if (!res.ok) return;
    const json = (await res.json()) as { campaigns: CampaignSummary[] };
    setCampaigns(json.campaigns);
  }, []);

  useEffect(() => {
    refreshLinks();
    refreshCampaigns();
  }, [refreshLinks, refreshCampaigns]);

  const previewUrl = (() => {
    if (!baseUrl.trim() || !utmSource || !utmMedium || !utmCampaign) return "";
    try {
      const u = new URL(baseUrl.trim());
      u.searchParams.set("utm_source", utmSource);
      u.searchParams.set("utm_medium", utmMedium);
      u.searchParams.set("utm_campaign", utmCampaign);
      if (utmTerm) u.searchParams.set("utm_term", utmTerm);
      if (utmContent) u.searchParams.set("utm_content", utmContent);
      return u.toString();
    } catch {
      return "";
    }
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          utmSource: utmSource.trim(),
          utmMedium: utmMedium.trim(),
          utmCampaign: utmCampaign.trim(),
          utmTerm: utmTerm.trim() || undefined,
          utmContent: utmContent.trim() || undefined,
          campaignName: campaignName.trim() || undefined,
          label: label.trim() || undefined,
          createdBy: createdBy.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "저장 실패");
        return;
      }
      setBaseUrl("");
      setUtmContent("");
      setUtmTerm("");
      setLabel("");
      await Promise.all([refreshLinks(), refreshCampaigns()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "에러");
    } finally {
      setBusy(false);
    }
  }

  async function copyShortLink(l: LinkRow) {
    const shortUrl = `${window.location.origin}/r/${l.shortCode}`;
    await navigator.clipboard.writeText(shortUrl);
    setCopiedId(l.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function deleteLink(id: string) {
    if (!confirm("이 링크를 삭제할까요? 클릭 통계도 같이 사라집니다.")) return;
    await fetch(`/api/links/${id}`, { method: "DELETE" });
    refreshLinks();
    refreshCampaigns();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link2 className="text-blue-600" size={28} />
          <h1 className="text-xl font-semibold">소캠1팀 캠페인 트래커</h1>
          <span className="hidden text-xs text-zinc-500 md:inline">
            · UTM + 단축 URL + GA
          </span>
        </div>
        <NextLink
          href="/settings"
          className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-200"
        >
          <SettingsIcon size={12} /> 설정
        </NextLink>
      </header>

      <div className="rounded-2xl bg-blue-50 px-4 py-3 text-sm text-zinc-700 ring-1 ring-zinc-200">
        <p>UTM 파라미터 붙은 링크를 자동으로 만들고, 단축 URL로 클릭 수도 같이 추적합니다.</p>
        <p className="mt-0.5 text-xs text-zinc-400">
          단축 URL 클릭 시 해당 페이지로 자동 이동 + 클릭 카운트 누적
        </p>
      </div>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={16} className="text-blue-600" /> 새 링크 만들기
        </h2>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="대상 URL" required>
            <input
              type="url"
              required
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://example.com/landing"
              className="w-full rounded-xl bg-zinc-100 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-400"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="utm_source" required>
              <input
                type="text"
                list="src-list"
                required
                value={utmSource}
                onChange={(e) => setUtmSource(e.target.value)}
                placeholder="예: instagram"
                className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none placeholder:text-zinc-400"
              />
              <datalist id="src-list">
                {PRESET_SOURCES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="utm_medium" required>
              <input
                type="text"
                list="med-list"
                required
                value={utmMedium}
                onChange={(e) => setUtmMedium(e.target.value)}
                placeholder="예: social"
                className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none placeholder:text-zinc-400"
              />
              <datalist id="med-list">
                {PRESET_MEDIUMS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="utm_campaign" required>
              <input
                type="text"
                required
                value={utmCampaign}
                onChange={(e) => setUtmCampaign(e.target.value)}
                placeholder="예: 2026_spring_launch"
                className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none placeholder:text-zinc-400"
              />
            </Field>
          </div>

          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex items-center gap-1 self-start text-xs text-zinc-400 hover:text-zinc-800"
          >
            <ChevronDown
              size={12}
              className={cn("transition", advancedOpen && "rotate-180")}
            />
            고급 옵션 (term / content / 캠페인 그룹 / 라벨 / 작성자)
          </button>

          {advancedOpen && (
            <div className="grid grid-cols-1 gap-3 rounded-xl bg-zinc-50 p-3 md:grid-cols-2">
              <Field label="utm_term (선택)">
                <input
                  type="text"
                  value={utmTerm}
                  onChange={(e) => setUtmTerm(e.target.value)}
                  placeholder="키워드 (CPC 등)"
                  className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none placeholder:text-zinc-400"
                />
              </Field>
              <Field label="utm_content (선택)">
                <input
                  type="text"
                  value={utmContent}
                  onChange={(e) => setUtmContent(e.target.value)}
                  placeholder="A/B 테스트 변형 등"
                  className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none placeholder:text-zinc-400"
                />
              </Field>
              <Field label="캠페인 그룹 (선택)">
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="예: 2026 봄 런칭"
                  className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none placeholder:text-zinc-400"
                />
              </Field>
              <Field label="라벨 (선택)">
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="이 링크 메모"
                  className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none placeholder:text-zinc-400"
                />
              </Field>
              <Field label="작성자 (자유 입력)">
                <input
                  type="text"
                  value={createdBy}
                  onChange={(e) => setCreatedBy(e.target.value)}
                  placeholder="이름"
                  className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none placeholder:text-zinc-400"
                />
              </Field>
            </div>
          )}

          {previewUrl && (
            <div className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                미리보기
              </div>
              <code className="block break-all text-xs text-emerald-700">
                {previewUrl}
              </code>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy || !baseUrl || !utmSource || !utmMedium || !utmCampaign}
              className="rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "저장 중…" : "링크 생성 + 단축"}
            </button>
          </div>
        </form>

        {/* UTM 파라미터 설명 */}
        <details className="mt-4 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600 ring-1 ring-zinc-200">
          <summary className="cursor-pointer font-medium text-zinc-700 hover:text-zinc-900">
            ❓ UTM 파라미터가 뭐예요?
          </summary>
          <div className="mt-3 space-y-2.5 text-[12px] leading-relaxed">
            <div>
              <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[11px] text-blue-700">utm_source</span>
              <span className="ml-2 font-medium text-zinc-700">트래픽 출처 (어디서 왔나)</span>
              <p className="mt-0.5 text-zinc-500">
                예: <code>instagram</code>, <code>facebook</code>, <code>kakao</code>, <code>naver</code>, <code>google</code>, <code>newsletter</code>
              </p>
            </div>
            <div>
              <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[11px] text-blue-700">utm_medium</span>
              <span className="ml-2 font-medium text-zinc-700">매체/채널 유형 (어떤 방식으로)</span>
              <p className="mt-0.5 text-zinc-500">
                예: <code>social</code>(SNS), <code>email</code>(메일), <code>cpc</code>(유료광고),
                <code>display</code>(배너), <code>referral</code>(추천 링크)
              </p>
            </div>
            <div>
              <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[11px] text-blue-700">utm_campaign</span>
              <span className="ml-2 font-medium text-zinc-700">캠페인 이름 (구분용)</span>
              <p className="mt-0.5 text-zinc-500">
                예: <code>2026_spring_launch</code>, <code>black_friday</code>, <code>brand_awareness_q1</code> — 한 캠페인 안에 여러 source/medium 가능
              </p>
            </div>
            <div>
              <span className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600">utm_term</span>
              <span className="ml-2 font-medium text-zinc-700">키워드 (선택)</span>
              <p className="mt-0.5 text-zinc-500">유료 검색 광고 키워드. 보통 안 써요.</p>
            </div>
            <div>
              <span className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600">utm_content</span>
              <span className="ml-2 font-medium text-zinc-700">컨텐츠 변형 (선택)</span>
              <p className="mt-0.5 text-zinc-500">A/B 테스트, 광고 소재 구분. 예: <code>ad_video_v1</code>, <code>banner_blue</code></p>
            </div>
            <div className="mt-3 rounded-lg bg-blue-50 p-2 text-[11px] text-blue-900 ring-1 ring-blue-200">
              💡 GA(Google Analytics)는 이 값을 보고 어디서 온 트래픽인지 자동 분류합니다. 같은 캠페인 안에서 채널별 효과를 비교하려면 <code>utm_source</code>/<code>utm_medium</code>은 채널마다 다르게, <code>utm_campaign</code>은 동일하게 유지하세요.
            </div>
          </div>
        </details>
      </section>

      {campaigns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveCampaign(null)}
            className={cn(
              "rounded-full px-3 py-1 text-xs",
              activeCampaign === null
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
            )}
          >
            전체 ({links.length})
          </button>
          {campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveCampaign(c.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                activeCampaign === c.id
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
              )}
            >
              {c.name}
              <span className="ml-1 text-[10px] opacity-70">{c.linkCount}</span>
            </button>
          ))}
        </div>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-600">
            저장된 링크 ({links.length})
          </h2>
          <div className="flex items-center gap-1 rounded-full bg-zinc-100 p-1 ring-1 ring-zinc-200">
            {(["none", "campaign"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupBy(g)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition",
                  groupBy === g
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800",
                )}
              >
                {g === "none" ? "리스트" : "📁 캠페인별"}
              </button>
            ))}
          </div>
        </div>

        {links.length === 0 ? (
          <div className="rounded-2xl bg-white py-12 text-center text-sm text-zinc-500">
            아직 저장된 링크가 없습니다. 위에서 첫 링크를 만들어보세요.
          </div>
        ) : groupBy === "campaign" ? (
          <GroupedView
            links={links}
            copiedId={copiedId}
            onCopy={copyShortLink}
            onDelete={deleteLink}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {links.map((l) => (
              <LinkCard
                key={l.id}
                link={l}
                copied={copiedId === l.id}
                onCopy={() => copyShortLink(l)}
                onDelete={() => deleteLink(l.id)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const UNGROUPED = "__ungrouped__";

function GroupedView({
  links,
  copiedId,
  onCopy,
  onDelete,
}: {
  links: LinkRow[];
  copiedId: string | null;
  onCopy: (l: LinkRow) => void;
  onDelete: (id: string) => void;
}) {
  // 캠페인별로 묶기
  const groups = new Map<string, { name: string; items: LinkRow[] }>();
  for (const l of links) {
    const key = l.campaign?.id ?? UNGROUPED;
    const name = l.campaign?.name ?? "캠페인 미지정";
    if (!groups.has(key)) groups.set(key, { name, items: [] });
    groups.get(key)!.items.push(l);
  }
  // 캠페인 알파벳 순 (미지정은 마지막)
  const ordered = [...groups.entries()]
    .filter(([k]) => k !== UNGROUPED)
    .sort((a, b) => a[1].name.localeCompare(b[1].name));
  if (groups.has(UNGROUPED)) ordered.push([UNGROUPED, groups.get(UNGROUPED)!]);

  return (
    <div className="flex flex-col gap-6">
      {ordered.map(([key, g]) => (
        <section key={key}>
          <header className="mb-2 flex items-center gap-2">
            <span
              className={
                key === UNGROUPED
                  ? "rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200"
                  : "rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800 ring-1 ring-purple-200"
              }
            >
              {key === UNGROUPED ? "📂 캠페인 미지정" : `📁 ${g.name}`}
            </span>
            <span className="text-[11px] text-zinc-400">{g.items.length}개</span>
          </header>
          <div className="flex flex-col gap-2">
            {g.items.map((l) => (
              <LinkCard
                key={l.id}
                link={l}
                copied={copiedId === l.id}
                onCopy={() => onCopy(l)}
                onDelete={() => onDelete(l.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-zinc-400">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </span>
      {children}
    </label>
  );
}

function LinkCard({
  link,
  copied,
  onCopy,
  onDelete,
}: {
  link: LinkRow;
  copied: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const shortUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/r/${link.shortCode}`
      : `/r/${link.shortCode}`;
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {link.label && (
            <div className="mb-0.5 truncate text-sm font-medium text-zinc-900">
              {link.label}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            {link.campaign && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-800 ring-1 ring-purple-200">
                📁 {link.campaign.name}
              </span>
            )}
            <span className="rounded-full bg-zinc-100 px-2 py-0.5">
              {link.utmSource} / {link.utmMedium}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5">
              {link.utmCampaign}
            </span>
            {link.utmContent && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px]">
                {link.utmContent}
              </span>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <code className="truncate rounded-lg bg-white px-2 py-1 text-xs text-emerald-700">
              {shortUrl}
            </code>
            <button
              type="button"
              onClick={onCopy}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs transition",
                copied
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-100 hover:bg-zinc-200",
              )}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "복사됨" : "복사"}
            </button>
          </div>
          <div className="mt-1 truncate text-[11px] text-zinc-400">
            → {link.longUrl}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <a
            href={`/links/${link.id}`}
            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1.5 text-xs hover:bg-zinc-200"
          >
            <BarChart3 size={12} />
            {link.clickCount} 클릭
          </a>
          <div className="flex items-center gap-1 text-[10px] text-zinc-400">
            {link.createdBy ? `${link.createdBy} · ` : ""}
            {new Date(link.createdAt).toLocaleDateString("ko-KR")}
          </div>
          <div className="flex gap-1">
            <a
              href={link.longUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              aria-label="원본 URL 열기"
            >
              <ExternalLink size={14} />
            </a>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-full p-1.5 text-zinc-500 hover:bg-red-100 hover:text-red-700"
              aria-label="삭제"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
