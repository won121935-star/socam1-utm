"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, LogOut, Settings as SettingsIcon } from "lucide-react";
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
          <SettingsIcon size={18} /> 설정
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

      <h2 className="text-sm font-semibold text-zinc-700">Google Analytics 4 연결</h2>

      {state === null ? (
        <p className="text-sm text-zinc-500">상태 확인 중…</p>
      ) : !state.connected ? (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
          <p className="mb-3 text-sm text-zinc-700">
            아직 연결되지 않았습니다. 본인 GA 4 계정으로 한 번 로그인하면, 캠페인별 세션·사용자·전환 데이터를 이 사이트에서 직접 볼 수 있어요.
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
