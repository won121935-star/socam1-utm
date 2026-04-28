"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface CampaignForCalendar {
  id: string;
  name: string;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
  linkCount?: number;
}

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

const COLORS = [
  { bar: "bg-blue-400", chip: "bg-blue-100 text-blue-800 ring-blue-200" },
  { bar: "bg-emerald-400", chip: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  { bar: "bg-purple-400", chip: "bg-purple-100 text-purple-800 ring-purple-200" },
  { bar: "bg-pink-400", chip: "bg-pink-100 text-pink-800 ring-pink-200" },
  { bar: "bg-amber-400", chip: "bg-amber-100 text-amber-800 ring-amber-200" },
  { bar: "bg-cyan-400", chip: "bg-cyan-100 text-cyan-800 ring-cyan-200" },
  { bar: "bg-rose-400", chip: "bg-rose-100 text-rose-800 ring-rose-200" },
];

function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

export function CampaignCalendar({
  campaigns,
}: {
  campaigns: CampaignForCalendar[];
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [viewMonth, setViewMonth] = useState<{ y: number; m: number } | null>(
    null,
  );

  useEffect(() => {
    const d = new Date();
    setNow(d);
    setViewMonth({ y: d.getFullYear(), m: d.getMonth() });
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const dated = useMemo(
    () => campaigns.filter((c) => c.startDate || c.endDate),
    [campaigns],
  );

  if (!now || !viewMonth) {
    return (
      <div className="rounded-2xl bg-white p-5 text-xs text-zinc-400 ring-1 ring-zinc-200">
        달력 로딩…
      </div>
    );
  }

  const { y: year, m: month } = viewMonth;
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  // 셀 빌드: 첫 주 빈칸 + 날짜
  type Cell = { day: number | null; key?: string; campaigns: CampaignForCalendar[] };
  const cells: Cell[] = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, campaigns: [] });
  for (let d = 1; d <= lastDate; d++) {
    const k = dateKey(year, month, d);
    const onThisDay = dated.filter((c) => {
      const s = c.startDate ?? "0000-00-00";
      const e = c.endDate ?? "9999-99-99";
      return k >= s && k <= e;
    });
    cells.push({ day: d, key: k, campaigns: onThisDay });
  }

  // 진행 중 / 다가오는 / 종료 분류
  const todayKeyForCmp = todayKey;
  const ongoing = dated.filter((c) => {
    const s = c.startDate ?? "0000-00-00";
    const e = c.endDate ?? "9999-99-99";
    return todayKeyForCmp >= s && todayKeyForCmp <= e;
  });
  const upcoming = dated
    .filter((c) => c.startDate && c.startDate > todayKeyForCmp)
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  const past = dated
    .filter((c) => c.endDate && c.endDate < todayKeyForCmp)
    .sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? ""));

  // 여기서부터 now/viewMonth 가 non-null 임이 보장됨 (위 early return) — 로컬 변수로 narrow
  const nowVal: Date = now;
  const vm = viewMonth;

  function shiftMonth(delta: number) {
    const d = new Date(vm.y, vm.m + delta, 1);
    setViewMonth({ y: d.getFullYear(), m: d.getMonth() });
  }

  function goToday() {
    setViewMonth({ y: nowVal.getFullYear(), m: nowVal.getMonth() });
  }

  const nowFormatted = `${nowVal.getFullYear()}.${pad2(nowVal.getMonth() + 1)}.${pad2(nowVal.getDate())} (${DAYS[nowVal.getDay()]}) ${pad2(nowVal.getHours())}:${pad2(nowVal.getMinutes())}`;

  function diffDays(target: string): number {
    const [yy, mm, dd] = target.split("-").map((s) => parseInt(s, 10));
    const t = new Date(yy, mm - 1, dd).getTime();
    const today = new Date(
      nowVal.getFullYear(),
      nowVal.getMonth(),
      nowVal.getDate(),
    ).getTime();
    return Math.round((t - today) / 86400000);
  }

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
      {/* 헤더: 월 네비게이션 + 현재 시각 */}
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="rounded-full p-1 hover:bg-zinc-100"
            aria-label="이전 달"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-semibold text-zinc-800">
            {year}년 {month + 1}월
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="rounded-full p-1 hover:bg-zinc-100"
            aria-label="다음 달"
          >
            <ChevronRight size={14} />
          </button>
          {(viewMonth.y !== now.getFullYear() ||
            viewMonth.m !== now.getMonth()) && (
            <button
              type="button"
              onClick={goToday}
              className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700 hover:bg-zinc-200"
            >
              오늘로
            </button>
          )}
        </div>
        <div className="font-mono text-[11px] text-zinc-500">{nowFormatted}</div>
      </header>

      {/* 7-column 미니 달력 */}
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {DAYS.map((d, i) => (
          <div
            key={d}
            className={cn(
              "py-1 text-[10px] font-medium",
              i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-zinc-500",
            )}
          >
            {d}
          </div>
        ))}
        {cells.map((cell, idx) => {
          if (!cell.day)
            return <div key={idx} className="aspect-square" aria-hidden />;
          const isToday = cell.key === todayKey;
          const dayOfWeek = (firstDay + cell.day - 1) % 7;
          return (
            <div
              key={idx}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-start rounded-lg p-1 text-[11px] transition",
                isToday
                  ? "bg-blue-600 font-bold text-white"
                  : "hover:bg-zinc-50",
                !isToday && dayOfWeek === 0 && "text-red-500",
                !isToday && dayOfWeek === 6 && "text-blue-500",
                !isToday && dayOfWeek !== 0 && dayOfWeek !== 6 && "text-zinc-700",
              )}
              title={
                cell.campaigns.length
                  ? `${cell.key}\n` +
                    cell.campaigns.map((c) => `📁 ${c.name}`).join("\n")
                  : cell.key
              }
            >
              <span>{cell.day}</span>
              {/* 캠페인 막대 (최대 3개) */}
              {cell.campaigns.length > 0 && (
                <div className="mt-auto flex w-full flex-col gap-0.5">
                  {cell.campaigns.slice(0, 3).map((c) => (
                    <div
                      key={c.id}
                      className={cn("h-0.5 w-full rounded-full", colorFor(c.id).bar)}
                    />
                  ))}
                  {cell.campaigns.length > 3 && (
                    <div className="text-[7px] text-zinc-400">
                      +{cell.campaigns.length - 3}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 진행 중 + 다가옴 */}
      {(ongoing.length > 0 || upcoming.length > 0) && (
        <div className="mt-3 space-y-1.5 border-t border-zinc-100 pt-3 text-xs">
          {ongoing.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                진행 중
              </span>
              {ongoing.map((c) => {
                const col = colorFor(c.id);
                const dayLeft = c.endDate ? diffDays(c.endDate) : null;
                return (
                  <span
                    key={c.id}
                    className={cn(
                      "rounded-full px-2 py-0.5 ring-1",
                      col.chip,
                    )}
                  >
                    📁 {c.name}
                    {c.startDate && (
                      <span className="ml-1 opacity-70">
                        ({c.startDate.slice(5)}~{c.endDate?.slice(5) ?? "?"})
                      </span>
                    )}
                    {dayLeft != null && dayLeft >= 0 && (
                      <span className="ml-1 font-semibold">D-{dayLeft}</span>
                    )}
                  </span>
                );
              })}
            </div>
          )}
          {upcoming.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                다가옴
              </span>
              {upcoming.slice(0, 5).map((c) => {
                const col = colorFor(c.id);
                const dayLeft = c.startDate ? diffDays(c.startDate) : null;
                return (
                  <span
                    key={c.id}
                    className={cn(
                      "rounded-full px-2 py-0.5 ring-1",
                      col.chip,
                    )}
                  >
                    📁 {c.name}
                    {c.startDate && (
                      <span className="ml-1 opacity-70">
                        ({c.startDate.slice(5)})
                      </span>
                    )}
                    {dayLeft != null && (
                      <span className="ml-1 font-semibold">D-{dayLeft}</span>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 데이터 없을 때 */}
      {dated.length === 0 && (
        <p className="mt-3 border-t border-zinc-100 pt-3 text-[11px] text-zinc-400">
          💡 새 링크 만들 때 캠페인 그룹 + 시작일/종료일을 입력하면 여기에 자동으로 표시돼요.
        </p>
      )}

      {/* 종료 (접힘) */}
      {past.length > 0 && (
        <details className="mt-2 text-[11px] text-zinc-500">
          <summary className="cursor-pointer hover:text-zinc-700">
            종료된 캠페인 ({past.length})
          </summary>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {past.slice(0, 10).map((c) => (
              <span
                key={c.id}
                className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-500"
              >
                {c.name} ({c.endDate?.slice(5) ?? "?"})
              </span>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
