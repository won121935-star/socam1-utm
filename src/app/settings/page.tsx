"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, LogOut, BarChart3 as GaIcon } from "lucide-react";
import Link from "next/link";

type ConnectionState =
  | { connected: false }
  | {
      connected: true;
      accountEmail: string;
      propertyId: string | null;
      propertyName: string | null;
      properties: { name: string; displayName: string }[];
    };

function ConnectedView({
  state,
  onSelectProperty,
  onDisconnect,
  saving,
}: {
  state: Extract<ConnectionState, { connected: true }>;
  onSelectProperty: (
    p: { name: string; displayName: string } | null,
  ) => Promise<void>;
  onDisconnect: () => Promise<void>;
  saving: boolean;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
      <div className="flex items-center gap-2 text-sm text-emerald-700">
        <Check size={14} />
        Google 계정 연결됨 ({state.accountEmail})
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs font-medium text-zinc-400">GA 4 속성 선택</div>
        {state.properties.length === 0 ? (
          <p className="text-xs text-zinc-500">
            접근 가능한 GA 4 속성이 없습니다. 연결한 계정이 GA 4 property에 access 권한이
            있는지 확인하세요.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {state.properties.map((p) => {
              const selected = state.propertyId === p.name;
              return (
                <button
                  key={p.name}
                  type="button"
                  disabled={saving}
                  onClick={() => onSelectProperty(p)}
                  className={
                    selected
                      ? "flex items-center justify-between gap-2 rounded-xl bg-blue-600 px-3 py-2 text-left text-sm text-white"
                      : "flex items-center justify-between gap-2 rounded-xl bg-zinc-100 px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-200"
                  }
                >
                  <span className="truncate">{p.displayName}</span>
                  <span className="shrink-0 text-[10px] text-zinc-400">
                    {p.name.replace("properties/", "")}
                    {selected && <Check size={12} className="ml-1 inline" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-zinc-200 pt-4">
        <button
          type="button"
          onClick={onDisconnect}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-full border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
        >
          <LogOut size={12} /> 연결 해제
        </button>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const [state, setState] = useState<ConnectionState | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  async function refresh() {
    const res = await fetch("/api/ga/connection");
    if (!res.ok) return;
    setState(await res.json());
  }

  useEffect(() => {
    void refresh();
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) {
      setNotice({ type: "ok", msg: "Google 연결 성공!" });
      window.history.replaceState({}, "", "/settings");
    } else if (params.get("error")) {
      setNotice({ type: "err", msg: `오류: ${params.get("error")}` });
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  async function selectProperty(p: { name: string; displayName: string } | null) {
    if (!p) return;
    setSaving(true);
    try {
      await fetch("/api/ga/connection", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          propertyId: p.name,
          propertyName: p.displayName,
        }),
      });
      await refresh();
      setNotice({ type: "ok", msg: "속성 선택 완료" });
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!confirm("Google 연결을 해제할까요?")) return;
    setSaving(true);
    try {
      await fetch("/api/ga/connection", { method: "DELETE" });
      await refresh();
      setNotice({ type: "ok", msg: "연결 해제됨" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-4 md:p-8">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="text-xs text-zinc-400 hover:text-zinc-800"
        >
          ← 메인
        </Link>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <GaIcon size={18} /> GA 연동
        </h1>
        <span />
      </header>

      {notice && (
        <div
          className={
            notice.type === "ok"
              ? "rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-emerald-200"
              : "rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200"
          }
        >
          {notice.msg}
        </div>
      )}

      {/* 광고대행사 시나리오 안내 — 가장 윗부분에 배치 */}
      <section className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200 text-sm text-zinc-700">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
          📢 GA 연동이 꼭 필요한가요?
        </h3>
        <p className="leading-relaxed">
          <b>아니요, 필수는 아닙니다.</b> UTM 빌더 + 단축 URL + 클릭 통계는 GA 없이도 100%
          동작해요. <b>유입 채널·시간대·국가·referrer</b>는 자체 측정으로 충분합니다.
        </p>
        <p className="mt-2 leading-relaxed">
          GA 연동을 하면 추가로 <b>체류시간 · 이탈률 · 전환수</b> 같은 「랜딩 페이지에서의 행동」
          데이터를 볼 수 있어요. 단, 이건 캠페인 destination 사이트에 GA가 깔려있고{" "}
          <b>운영자가 본인 이메일을 GA 4 속성 뷰어로 추가</b>해줘야 가능합니다.
        </p>

        <details className="mt-3 rounded-xl bg-white/70 p-3 ring-1 ring-amber-200">
          <summary className="cursor-pointer text-xs font-semibold text-amber-900">
            💼 광고대행사 — 고객사에게 GA 권한 요청하는 멘트 예시
          </summary>
          <div className="mt-2 space-y-2 text-xs text-zinc-700">
            <p>
              자사 사이트가 아닌 고객사 캠페인이라면, 고객사 GA 운영자에게 아래처럼 요청하시면
              됩니다:
            </p>
            <blockquote className="rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2 italic">
              「캠페인 효과 측정용으로 GA 4 속성에 <b>뷰어(Viewer) 권한</b> 추가
              부탁드립니다.
              <br />
              이메일은 <code className="rounded bg-white px-1">won121935@gmail.com</code>{" "}
              입니다.
              <br />
              경로: 관리자 → 속성 → 속성 액세스 관리 → + 사용자 추가」
            </blockquote>
            <p className="text-zinc-500">
              ⚠️ 대형 회사(보안 정책)·디지털 인프라 약한 곳은 거절될 수 있어요. 그땐{" "}
              <b>자체 클릭 통계만으로 보고</b>해도 충분합니다.
            </p>
          </div>
        </details>
      </section>

      <h2 className="text-sm font-semibold text-zinc-700">Google Analytics 4 연결</h2>

      {state === null ? (
        <p className="text-sm text-zinc-500">상태 확인 중…</p>
      ) : !state.connected ? (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
          <p className="mb-3 text-sm text-zinc-700">
            아직 연결되지 않았습니다. 본인 GA 4 권한 있는 구글 계정으로 한 번 로그인하면,
            캠페인별 세션·사용자·전환 데이터를 이 사이트에서 직접 볼 수 있어요.
          </p>
          <a
            href="/api/auth/google/start"
            className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Google 계정으로 연결 <ExternalLink size={12} />
          </a>
          <p className="mt-3 text-[11px] text-zinc-500">
            * 분석 데이터 readonly 권한만 요청합니다 (수정 불가).
          </p>
        </section>
      ) : (
        <ConnectedView
          state={state}
          onSelectProperty={selectProperty}
          onDisconnect={disconnect}
          saving={saving}
        />
      )}

      {/* 사용 안내 */}
      <section className="rounded-2xl bg-blue-50 p-5 ring-1 ring-zinc-200 text-xs text-zinc-400">
        <h3 className="mb-2 text-sm font-semibold text-zinc-700">사용 안내</h3>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>위 [Google 계정으로 연결] 클릭 → 본인 GA 4 권한 있는 구글 계정 로그인</li>
          <li>analytics.readonly 권한 승인</li>
          <li>돌아오면 GA 4 속성 목록에서 추적할 속성 선택</li>
          <li>이제 각 링크 상세 페이지에서 해당 utm_campaign 의 GA 데이터가 자동 표시됨</li>
        </ol>
      </section>
    </main>
  );
}
