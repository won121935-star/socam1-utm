"use client";

import { useMemo, useRef, useState } from "react";
import {
  Upload,
  Download,
  Shuffle,
  ArrowLeft,
  Users,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import * as XLSX from "xlsx";

interface Person {
  group: string;
  name: string;
}

interface TableSeat {
  group: string;
  name: string;
}

const MAX_TABLES = 37;
const SEATS_PER_TABLE = 8;

export default function TeamBuilder() {
  const [people, setPeople] = useState<Person[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
        const parsed: Person[] = [];
        for (const r of rows) {
          // Find 조 / 그룹 / group / team-like column
          const groupKey = Object.keys(r).find((k) =>
            /조|그룹|group|team|반/i.test(k),
          );
          // Find 이름 / name column
          const nameKey = Object.keys(r).find((k) => /이름|성명|name/i.test(k));
          if (!groupKey || !nameKey) continue;
          const group = String(r[groupKey] ?? "").trim();
          const name = String(r[nameKey] ?? "").trim();
          if (!group || !name) continue;
          parsed.push({ group, name });
        }
        if (parsed.length === 0) {
          setError(
            "조와 이름 컬럼을 찾을 수 없습니다. 첫 행이 헤더(예: '조', '이름')여야 합니다.",
          );
          return;
        }
        setPeople(parsed);
        setFileName(file.name);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "엑셀 파일을 읽을 수 없습니다.",
        );
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Best-Fit Decreasing 으로 테이블 배정
  const assignment = useMemo(() => {
    if (people.length === 0) return null;

    // 조별로 묶기
    const groupsMap = new Map<string, string[]>();
    for (const p of people) {
      if (!groupsMap.has(p.group)) groupsMap.set(p.group, []);
      groupsMap.get(p.group)!.push(p.name);
    }
    // 조를 인원 수 내림차순으로 정렬
    const groups = [...groupsMap.entries()]
      .map(([name, members]) => ({ name, members }))
      .sort((a, b) => b.members.length - a.members.length);

    const tables: TableSeat[][] = Array.from({ length: MAX_TABLES }, () => []);
    const splits: { group: string; tables: number[] }[] = [];
    const overflow: TableSeat[] = [];

    for (const g of groups) {
      let remaining = [...g.members];
      const placedTables: number[] = [];

      while (remaining.length > 0) {
        const space = (i: number) => SEATS_PER_TABLE - tables[i].length;

        // 1. 통째로 들어가는 가장 작은 빈 자리 찾기 (Best Fit)
        let bestIdx = -1;
        let bestSpace = Infinity;
        for (let i = 0; i < tables.length; i++) {
          const sp = space(i);
          if (sp >= remaining.length && sp < bestSpace) {
            bestIdx = i;
            bestSpace = sp;
          }
        }

        if (bestIdx !== -1) {
          // 통째로 배정
          for (const name of remaining) {
            tables[bestIdx].push({ group: g.name, name });
          }
          placedTables.push(bestIdx + 1);
          remaining = [];
        } else {
          // 못 들어가면 가장 빈 자리 많은 곳에 부분 배정
          let mostIdx = 0;
          for (let i = 1; i < tables.length; i++) {
            if (space(i) > space(mostIdx)) mostIdx = i;
          }
          const cap = space(mostIdx);
          if (cap === 0) {
            // 자리 없음 — overflow
            for (const n of remaining) overflow.push({ group: g.name, name: n });
            remaining = [];
          } else {
            const taken = remaining.splice(0, cap);
            for (const name of taken) {
              tables[mostIdx].push({ group: g.name, name });
            }
            placedTables.push(mostIdx + 1);
          }
        }
      }
      if (placedTables.length > 1) {
        splits.push({ group: g.name, tables: placedTables });
      }
    }

    return { tables, splits, overflow, totalGroups: groups.length };
  }, [people]);

  function downloadExcel() {
    if (!assignment) return;
    const rows: { 테이블: number; 조: string; 이름: string }[] = [];
    assignment.tables.forEach((seats, i) => {
      for (const s of seats) {
        rows.push({ 테이블: i + 1, 조: s.group, 이름: s.name });
      }
    });
    if (assignment.overflow.length > 0) {
      for (const s of assignment.overflow) {
        rows.push({ 테이블: 0, 조: s.group, 이름: s.name });
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "테이블배정");
    XLSX.writeFile(wb, "테이블배정.xlsx");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-4 md:p-8">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"
        >
          <ArrowLeft size={12} /> 메인
        </Link>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Users size={18} /> 테이블 배정기
        </h1>
        <span />
      </header>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">
          1️⃣ 엑셀 업로드
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          엑셀 파일에 <code>조</code>(또는 그룹/group/team)와 <code>이름</code>{" "}
          컬럼이 있어야 합니다. 첫 행이 헤더.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500">
            <Upload size={14} /> 엑셀 파일 선택
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>
          {fileName && (
            <span className="text-xs text-zinc-600">
              📄 {fileName} · {people.length}명
            </span>
          )}
        </div>
        {error && (
          <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}

        <details className="mt-4 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600 ring-1 ring-zinc-200">
          <summary className="cursor-pointer font-medium text-zinc-700">
            📋 엑셀 양식 예시
          </summary>
          <table className="mt-3 w-fit border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="border border-zinc-300 bg-white px-3 py-1 text-left">조</th>
                <th className="border border-zinc-300 bg-white px-3 py-1 text-left">이름</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-zinc-300 px-3 py-1">A</td>
                <td className="border border-zinc-300 px-3 py-1">홍길동</td>
              </tr>
              <tr>
                <td className="border border-zinc-300 px-3 py-1">A</td>
                <td className="border border-zinc-300 px-3 py-1">김철수</td>
              </tr>
              <tr>
                <td className="border border-zinc-300 px-3 py-1">B</td>
                <td className="border border-zinc-300 px-3 py-1">박영희</td>
              </tr>
            </tbody>
          </table>
        </details>
      </section>

      {assignment && (
        <>
          <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
                2️⃣ 배정 결과 (총 {people.length}명, {assignment.totalGroups}개 조)
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPeople([...people])}
                  className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1.5 text-xs hover:bg-zinc-200"
                >
                  <Shuffle size={12} /> 다시 계산
                </button>
                <button
                  type="button"
                  onClick={downloadExcel}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  <Download size={12} /> 엑셀 다운로드
                </button>
              </div>
            </div>

            {assignment.splits.length > 0 && (
              <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800 ring-1 ring-amber-200">
                <AlertTriangle className="mr-1 inline" size={11} /> 8명을 초과한
                조는 인접 테이블로 분할됐습니다:
                <ul className="mt-1 list-disc pl-4">
                  {assignment.splits.map((s) => (
                    <li key={s.group}>
                      <b>{s.group}조</b>{" "}
                      → 테이블 {s.tables.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {assignment.overflow.length > 0 && (
              <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
                ⚠️ 좌석 부족 ({assignment.overflow.length}명):
                {assignment.overflow.map((p) => `${p.group}/${p.name}`).join(", ")}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {assignment.tables.map((seats, i) => {
                if (seats.length === 0) {
                  return (
                    <div
                      key={i}
                      className="rounded-xl bg-zinc-50 p-2 text-center text-[10px] text-zinc-400 ring-1 ring-zinc-200"
                    >
                      <div className="font-semibold">테이블 {i + 1}</div>
                      <div>(빈 자리)</div>
                    </div>
                  );
                }
                // 같은 테이블 안에서 조별로 묶어서 보여주기
                const byGroup = new Map<string, string[]>();
                for (const s of seats) {
                  if (!byGroup.has(s.group)) byGroup.set(s.group, []);
                  byGroup.get(s.group)!.push(s.name);
                }
                return (
                  <div
                    key={i}
                    className="rounded-xl bg-white p-2 text-[11px] ring-1 ring-zinc-200"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-semibold text-zinc-800">
                        테이블 {i + 1}
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        {seats.length}/{SEATS_PER_TABLE}
                      </span>
                    </div>
                    {[...byGroup.entries()].map(([g, names]) => (
                      <div key={g} className="mb-1">
                        <div className="text-[10px] font-medium text-blue-700">
                          {g}조 ({names.length})
                        </div>
                        <div className="text-[11px] text-zinc-700">
                          {names.join(", ")}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
