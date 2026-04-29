"use client";

import { useEffect, useState } from "react";
import { Save, X } from "lucide-react";

export interface EditableLink {
  id: string;
  baseUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string | null;
  utmContent: string | null;
  label: string | null;
  createdBy: string | null;
  campaign: { id: string; name: string } | null;
}

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
const PRESET_MEDIUMS = [
  "social",
  "email",
  "cpc",
  "display",
  "referral",
  "story",
  "feed",
  "dm",
  "banner",
];

export function EditLinkDialog({
  link,
  campaignSuggestions,
  onClose,
  onSaved,
}: {
  link: EditableLink;
  campaignSuggestions: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [baseUrl, setBaseUrl] = useState(link.baseUrl);
  const [utmSource, setUtmSource] = useState(link.utmSource);
  const [utmMedium, setUtmMedium] = useState(link.utmMedium);
  const [utmCampaign, setUtmCampaign] = useState(link.utmCampaign);
  const [utmTerm, setUtmTerm] = useState(link.utmTerm ?? "");
  const [utmContent, setUtmContent] = useState(link.utmContent ?? "");
  const [campaignName, setCampaignName] = useState(link.campaign?.name ?? "");
  const [label, setLabel] = useState(link.label ?? "");
  const [createdBy, setCreatedBy] = useState(link.createdBy ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/links/${link.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          utmSource: utmSource.trim(),
          utmMedium: utmMedium.trim(),
          utmCampaign: utmCampaign.trim(),
          utmTerm: utmTerm.trim() || null,
          utmContent: utmContent.trim() || null,
          campaignName: campaignName.trim() || null,
          label: label.trim() || null,
          createdBy: createdBy.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "수정 실패");
        return;
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "에러");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-200"
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <h2 className="text-sm font-semibold">✏️ 링크 수정</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 hover:bg-zinc-100"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-5">
          <div className="flex flex-col gap-3">
            <Field label="대상 URL">
              <input
                type="url"
                required
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none"
              />
            </Field>

            <Field label="📁 캠페인 그룹">
              <input
                type="text"
                list="edit-campaign-list"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="비워두면 캠페인 그룹에서 제거"
                className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none"
              />
              <datalist id="edit-campaign-list">
                {campaignSuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="utm_source">
                <input
                  type="text"
                  list="edit-src"
                  required
                  value={utmSource}
                  onChange={(e) => setUtmSource(e.target.value)}
                  className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none"
                />
                <datalist id="edit-src">
                  {PRESET_SOURCES.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </Field>
              <Field label="utm_medium">
                <input
                  type="text"
                  list="edit-med"
                  required
                  value={utmMedium}
                  onChange={(e) => setUtmMedium(e.target.value)}
                  className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none"
                />
                <datalist id="edit-med">
                  {PRESET_MEDIUMS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </Field>
              <Field label="utm_campaign">
                <input
                  type="text"
                  required
                  value={utmCampaign}
                  onChange={(e) => setUtmCampaign(e.target.value)}
                  className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="utm_term">
                <input
                  type="text"
                  value={utmTerm}
                  onChange={(e) => setUtmTerm(e.target.value)}
                  className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none"
                />
              </Field>
              <Field label="utm_content">
                <input
                  type="text"
                  value={utmContent}
                  onChange={(e) => setUtmContent(e.target.value)}
                  className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="라벨">
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none"
                />
              </Field>
              <Field label="작성자">
                <input
                  type="text"
                  value={createdBy}
                  onChange={(e) => setCreatedBy(e.target.value)}
                  className="w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm outline-none"
                />
              </Field>
            </div>

            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700 ring-1 ring-amber-200">
              ⚠️ UTM 파라미터를 수정하면 long URL이 재생성됩니다. 단축 코드는 그대로 유지되어
              기존에 공유된 단축 URL은 계속 동작합니다.
            </p>

            {error && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm hover:bg-zinc-100"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            <Save size={14} /> {busy ? "저장 중…" : "저장"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
