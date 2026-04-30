"use client";

import { useMemo, useRef, useState } from "react";
import {
  Upload,
  Download,
  Shuffle,
  ArrowLeft,
  Users,
  AlertTriangle,
  Image as ImageIcon,
} from "lucide-react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { toPng } from "html-to-image";

const GROUP_COLORS = [
  "bg-blue-100 text-blue-800 ring-blue-200",
  "bg-emerald-100 text-emerald-800 ring-emerald-200",
  "bg-amber-100 text-amber-800 ring-amber-200",
  "bg-purple-100 text-purple-800 ring-purple-200",
  "bg-pink-100 text-pink-800 ring-pink-200",
  "bg-cyan-100 text-cyan-800 ring-cyan-200",
  "bg-rose-100 text-rose-800 ring-rose-200",
  "bg-violet-100 text-violet-800 ring-violet-200",
  "bg-orange-100 text-orange-800 ring-orange-200",
  "bg-teal-100 text-teal-800 ring-teal-200",
  "bg-lime-100 text-lime-800 ring-lime-200",
  "bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200",
];

function colorForGroup(name: string): string {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
}

interface Person {
  group: string;
  name: string;
  phone: string; // 핸드폰 뒷자리
  company: string; // 상호명 (선택)
}

interface TableSeat {
  group: string;
  name: string;
  phone: string;
  company: string;
}

const SEATS_PER_TABLE = 8;

export default function TeamBuilder() {
  const [people, setPeople] = useState<Person[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numTables, setNumTables] = useState<number>(37);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

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
          // Find 조번호 / 그룹 / group / team-like column
          const groupKey = Object.keys(r).find((k) =>
            /조번호|조|그룹|group|team|반/i.test(k),
          );
          // Find 이름 / name column
          const nameKey = Object.keys(r).find((k) => /이름|성명|name/i.test(k));
          // Find 핸드폰 뒷자리 column
          const phoneKey = Object.keys(r).find((k) =>
            /핸드폰|폰|뒷|연락처|전화|phone|mobile|tel/i.test(k),
          );
          // Find 상호명 / 업체 / company column
          const companyKey = Object.keys(r).find((k) =>
            /상호|업체|회사|company|brand|소속/i.test(k),
          );
          if (!groupKey || !nameKey) continue;
          const group = String(r[groupKey] ?? "").trim();
          const name = String(r[nameKey] ?? "").trim();
          const phone = phoneKey ? String(r[phoneKey] ?? "").trim() : "";
          const company = companyKey ? String(r[companyKey] ?? "").trim() : "";
          if (!group || !name) continue;
          parsed.push({ group, name, phone, company });
        }
        if (parsed.length === 0) {
          setError(
            "이름·조번호·핸드폰 컬럼을 찾을 수 없습니다. 첫 행이 헤더여야 합니다 (예: '이름', '조번호', '핸드폰 뒷자리').",
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

  // 입력 데이터 검증
  const validation = useMemo(() => {
    if (people.length === 0) return null;

    type Issue = {
      severity: "error" | "warning";
      label: string;
      detail: string;
    };
    const issues: Issue[] = [];

    // 1. 이름+폰 둘 다 일치 = 확실한 중복 (error)
    const exactKey = new Map<string, Person[]>();
    for (const p of people) {
      const k = `${p.name}|${p.phone}`;
      if (!exactKey.has(k)) exactKey.set(k, []);
      exactKey.get(k)!.push(p);
    }
    for (const [, dups] of exactKey) {
      if (dups.length > 1) {
        const sample = dups[0];
        issues.push({
          severity: "error",
          label: "🔴 완전 중복 (이름+폰 일치)",
          detail: `${sample.name} (${sample.phone}) — ${dups.length}회 등장`,
        });
      }
    }

    // 2. 이름만 일치 = 동명이인 가능 (warning)
    const byName = new Map<string, Person[]>();
    for (const p of people) {
      if (!byName.has(p.name)) byName.set(p.name, []);
      byName.get(p.name)!.push(p);
    }
    for (const [name, dups] of byName) {
      if (dups.length > 1) {
        // 폰까지 다 같으면 위에서 잡힌 거니까 스킵
        const phones = new Set(dups.map((d) => d.phone));
        if (phones.size > 1) {
          issues.push({
            severity: "warning",
            label: "🟡 이름 중복 (동명이인 가능)",
            detail: `${name} — 폰: ${[...phones].join(", ")} (${dups.length}명)`,
          });
        }
      }
    }

    // 3. 폰 뒷자리만 일치
    const byPhone = new Map<string, Person[]>();
    for (const p of people) {
      if (!p.phone) continue;
      if (!byPhone.has(p.phone)) byPhone.set(p.phone, []);
      byPhone.get(p.phone)!.push(p);
    }
    for (const [phone, dups] of byPhone) {
      if (dups.length > 1) {
        const names = new Set(dups.map((d) => d.name));
        if (names.size > 1) {
          issues.push({
            severity: "warning",
            label: "🟡 폰 뒷자리 중복",
            detail: `${phone} — ${[...names].join(", ")}`,
          });
        }
      }
    }

    // 4. 폰 형식이 4자리 숫자 아닌 경우 (있을 때만)
    const badPhones = people.filter(
      (p) => p.phone && !/^\d{4}$/.test(p.phone),
    );
    if (badPhones.length > 0) {
      issues.push({
        severity: "warning",
        label: "🟡 폰 형식 의심 (4자리 숫자 아님)",
        detail: badPhones
          .slice(0, 5)
          .map((p) => `${p.name}: ${p.phone}`)
          .join(", ") + (badPhones.length > 5 ? ` 외 ${badPhones.length - 5}건` : ""),
      });
    }

    // 5. 좌석 수 부족
    const capacity = numTables * SEATS_PER_TABLE;
    if (people.length > capacity) {
      issues.push({
        severity: "error",
        label: "🔴 좌석 부족",
        detail: `현재 ${people.length}명 / 가용 ${capacity}석 → ${
          people.length - capacity
        }명 자리 없음. 테이블 수를 ${Math.ceil(
          people.length / SEATS_PER_TABLE,
        )}개 이상으로 늘리세요.`,
      });
    }

    // 6. 조별 인원 통계
    const groupSizes = new Map<string, number>();
    for (const p of people) {
      groupSizes.set(p.group, (groupSizes.get(p.group) ?? 0) + 1);
    }
    const groupStats = [...groupSizes.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([g, n]) => `${g}: ${n}명`)
      .join(" · ");

    return {
      issues,
      groupStats,
      totalPeople: people.length,
      totalGroups: groupSizes.size,
      capacity,
    };
  }, [people, numTables]);

  // Best-Fit Decreasing 으로 테이블 배정
  const assignment = useMemo(() => {
    if (people.length === 0) return null;

    // 조별로 묶기
    const groupsMap = new Map<
      string,
      { name: string; phone: string; company: string }[]
    >();
    for (const p of people) {
      if (!groupsMap.has(p.group)) groupsMap.set(p.group, []);
      groupsMap.get(p.group)!.push({ name: p.name, phone: p.phone, company: p.company });
    }
    // 조를 인원 수 내림차순으로 정렬
    const groups = [...groupsMap.entries()]
      .map(([name, members]) => ({ name, members }))
      .sort((a, b) => b.members.length - a.members.length);

    const tables: TableSeat[][] = Array.from({ length: numTables }, () => []);
    const splits: { group: string; tables: number[] }[] = [];
    const overflow: TableSeat[] = [];

    // 그룹 size > 8 이면 ceil(size/8)개로 균등 분배 (예: 17 → 6+6+5)
    function evenChunks(size: number): number[] {
      if (size <= SEATS_PER_TABLE) return [size];
      const numChunks = Math.ceil(size / SEATS_PER_TABLE);
      const base = Math.floor(size / numChunks);
      const extra = size % numChunks;
      return Array.from({ length: numChunks }, (_, i) =>
        i < extra ? base + 1 : base,
      );
    }

    // 정책: Best-Fit Decreasing — 청크가 통째로 들어가는 "가장 작은 빈 자리"
    // 우선 선택 → 자연스럽게 4+4 처럼 같은 테이블에 모여서 8명 채움.
    // 통째로 들어갈 곳 없으면 가장 빈 자리 많은 테이블에 부분 채움.
    // 모든 좌석 다 찰 때만 overflow.
    for (const g of groups) {
      const chunks = evenChunks(g.members.length);
      const placedTables: number[] = [];
      let memberIdx = 0;

      for (const chunkSize of chunks) {
        let remaining = chunkSize;

        while (remaining > 0) {
          // Best Fit: 통째로 들어가는 가장 작은 잔여 자리
          let bestIdx = -1;
          let bestSpace = Infinity;
          for (let i = 0; i < tables.length; i++) {
            const sp = SEATS_PER_TABLE - tables[i].length;
            if (sp > 0 && sp >= remaining && sp < bestSpace) {
              bestIdx = i;
              bestSpace = sp;
            }
          }

          if (bestIdx !== -1) {
            // 통째로 들어감
            for (let j = 0; j < remaining; j++) {
              const m = g.members[memberIdx++];
              tables[bestIdx].push({
                group: g.name,
                name: m.name,
                phone: m.phone,
                company: m.company,
              });
            }
            if (!placedTables.includes(bestIdx + 1))
              placedTables.push(bestIdx + 1);
            remaining = 0;
          } else {
            // 통째로 안 들어가면 가장 빈 자리 많은 테이블에 부분 채우기
            let mostIdx = -1;
            let mostSpace = 0;
            for (let i = 0; i < tables.length; i++) {
              const sp = SEATS_PER_TABLE - tables[i].length;
              if (sp > mostSpace) {
                mostSpace = sp;
                mostIdx = i;
              }
            }
            if (mostIdx === -1) {
              // 진짜 자리 없음
              for (let j = 0; j < remaining; j++) {
                const m = g.members[memberIdx++];
                overflow.push({
                  group: g.name,
                  name: m.name,
                  phone: m.phone,
                  company: m.company,
                });
              }
              remaining = 0;
              break;
            }
            const ps = mostSpace;
            for (let j = 0; j < ps; j++) {
              const m = g.members[memberIdx++];
              tables[mostIdx].push({
                group: g.name,
                name: m.name,
                phone: m.phone,
                company: m.company,
              });
            }
            if (!placedTables.includes(mostIdx + 1))
              placedTables.push(mostIdx + 1);
            remaining -= ps;
          }
        }
      }
      if (placedTables.length > 1) {
        splits.push({ group: g.name, tables: placedTables });
      }
    }

    return { tables, splits, overflow, totalGroups: groups.length };
  }, [people, numTables]);

  function downloadExcel() {
    if (!assignment) return;
    const rows: {
      테이블번호: number | string;
      조번호: string;
      이름: string;
      상호명: string;
      "핸드폰 뒷자리": string;
    }[] = [];
    assignment.tables.forEach((seats, i) => {
      for (const s of seats) {
        rows.push({
          테이블번호: i + 1,
          조번호: s.group,
          이름: s.name,
          상호명: s.company,
          "핸드폰 뒷자리": s.phone,
        });
      }
    });
    if (assignment.overflow.length > 0) {
      for (const s of assignment.overflow) {
        rows.push({
          테이블번호: "(좌석부족)",
          조번호: s.group,
          이름: s.name,
          상호명: s.company,
          "핸드폰 뒷자리": s.phone,
        });
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "테이블배정");
    XLSX.writeFile(wb, "테이블배정.xlsx");
  }

  async function downloadImage() {
    if (!resultRef.current) return;
    try {
      const dataUrl = await toPng(resultRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.download = "테이블배정.png";
      link.href = dataUrl;
      link.click();
    } catch (e) {
      alert(e instanceof Error ? e.message : "이미지 생성 실패");
    }
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
          1️⃣ 테이블 수량 설정
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
            테이블 수
            <input
              type="number"
              min={1}
              max={500}
              value={numTables}
              onChange={(e) =>
                setNumTables(Math.max(1, parseInt(e.target.value, 10) || 1))
              }
              className="w-20 rounded-xl bg-zinc-100 px-3 py-1.5 text-sm outline-none"
            />
            <span className="text-xs text-zinc-500">개 (각 {SEATS_PER_TABLE}명)</span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">
          2️⃣ 엑셀 업로드
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          엑셀 파일에 <code>조번호</code>, <code>이름</code>, <code>상호명</code>(선택), <code>핸드폰 뒷자리</code> 컬럼이 있어야 합니다. 첫 행이 헤더, 컬럼 순서는 자유.
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
                <th className="border border-zinc-300 bg-white px-3 py-1 text-left">조번호</th>
                <th className="border border-zinc-300 bg-white px-3 py-1 text-left">이름</th>
                <th className="border border-zinc-300 bg-white px-3 py-1 text-left">상호명</th>
                <th className="border border-zinc-300 bg-white px-3 py-1 text-left">핸드폰 뒷자리</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-zinc-300 px-3 py-1">A</td>
                <td className="border border-zinc-300 px-3 py-1">홍길동</td>
                <td className="border border-zinc-300 px-3 py-1">까페 모카</td>
                <td className="border border-zinc-300 px-3 py-1">1234</td>
              </tr>
              <tr>
                <td className="border border-zinc-300 px-3 py-1">A</td>
                <td className="border border-zinc-300 px-3 py-1">김철수</td>
                <td className="border border-zinc-300 px-3 py-1">까페 모카</td>
                <td className="border border-zinc-300 px-3 py-1">5678</td>
              </tr>
              <tr>
                <td className="border border-zinc-300 px-3 py-1">B</td>
                <td className="border border-zinc-300 px-3 py-1">박영희</td>
                <td className="border border-zinc-300 px-3 py-1">맛집 김밥</td>
                <td className="border border-zinc-300 px-3 py-1">9012</td>
              </tr>
            </tbody>
          </table>
        </details>
      </section>

      {validation && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-700">
              3️⃣ 데이터 검증
            </h2>
            <span className="text-xs text-zinc-500">
              총 {validation.totalPeople}명 · {validation.totalGroups}개 조 · 가용 좌석 {validation.capacity}
            </span>
          </div>

          {/* 통과 메시지 */}
          {validation.issues.length === 0 ? (
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-emerald-200">
              ✅ 검증 통과 — 중복·오류 없음
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {validation.issues.map((iss, idx) => (
                <li
                  key={idx}
                  className={
                    iss.severity === "error"
                      ? "rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200"
                      : "rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200"
                  }
                >
                  <div className="font-semibold">{iss.label}</div>
                  <div className="mt-0.5">{iss.detail}</div>
                </li>
              ))}
            </ul>
          )}

          {/* 조별 통계 */}
          <details className="mt-3 rounded-xl bg-zinc-50 p-2 text-[11px] text-zinc-600 ring-1 ring-zinc-200">
            <summary className="cursor-pointer font-medium text-zinc-700">
              📊 조별 인원 분포
            </summary>
            <div className="mt-2 leading-relaxed">{validation.groupStats}</div>
          </details>
        </section>
      )}

      {assignment && (
        <>
          <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
                4️⃣ 배정 결과 (총 {people.length}명, {assignment.totalGroups}개 조)
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
                  onClick={downloadImage}
                  className="inline-flex items-center gap-1 rounded-full bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500"
                >
                  <ImageIcon size={12} /> 이미지 다운로드
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

            <div ref={resultRef} className="bg-white p-3">
              <div className="mb-3 flex items-baseline justify-between border-b border-zinc-200 pb-2">
                <h3 className="text-sm font-bold text-zinc-800">
                  테이블 배정표
                </h3>
                <span className="text-[11px] text-zinc-500">
                  {new Date().toLocaleDateString("ko-KR")} · 총 {people.length}명
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {assignment.tables.map((seats, i) => {
                if (seats.length === 0) {
                  return (
                    <div
                      key={i}
                      className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 p-4 text-center"
                    >
                      <div className="text-sm font-bold text-zinc-400">
                        테이블 {i + 1}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-400">
                        빈 자리
                      </div>
                    </div>
                  );
                }
                // 같은 테이블 안에서 조별로 묶어서 보여주기 (members로 phone까지)
                const byGroup = new Map<
                  string,
                  { name: string; phone: string; company: string }[]
                >();
                for (const s of seats) {
                  if (!byGroup.has(s.group)) byGroup.set(s.group, []);
                  byGroup.get(s.group)!.push({
                    name: s.name,
                    phone: s.phone,
                    company: s.company,
                  });
                }
                const isFull = seats.length === SEATS_PER_TABLE;
                return (
                  <div
                    key={i}
                    className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-baseline justify-between border-b border-zinc-100 pb-2">
                      <h3 className="text-base font-bold text-zinc-900">
                        🪑 테이블 {i + 1}
                      </h3>
                      <span
                        className={
                          isFull
                            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                            : "rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600"
                        }
                      >
                        {seats.length}/{SEATS_PER_TABLE}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {[...byGroup.entries()].map(([g, members]) => (
                        <div key={g}>
                          <div
                            className={
                              "mb-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 " +
                              colorForGroup(g)
                            }
                          >
                            {g}조 · {members.length}명
                          </div>
                          <ul className="space-y-1">
                            {members.map((m, idx) => (
                              <li
                                key={idx}
                                className="flex items-baseline justify-between rounded-md bg-zinc-50 px-2 py-1 text-sm"
                              >
                                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                                  <span
                                    className={
                                      "shrink-0 rounded px-1 py-0.5 text-[10px] font-bold " +
                                      colorForGroup(g)
                                    }
                                  >
                                    {g}조
                                  </span>
                                  <span className="font-medium text-zinc-800">
                                    {m.name}
                                  </span>
                                  {m.company && (
                                    <span className="text-[11px] text-zinc-500">
                                      · {m.company}
                                    </span>
                                  )}
                                </span>
                                {m.phone && (
                                  <span className="shrink-0 font-mono text-[11px] text-zinc-500">
                                    {m.phone}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
