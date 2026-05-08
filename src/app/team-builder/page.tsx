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

// 조 이름 → 색상 매핑. 모든 조가 다른 색이 되도록 HSL 색상환 균등 분할.
function buildGroupColorMap(
  groupNames: string[],
): Map<string, { bg: string; text: string; ring: string }> {
  const sorted = [...new Set(groupNames)].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );
  const map = new Map<string, { bg: string; text: string; ring: string }>();
  const total = Math.max(sorted.length, 1);
  // 황금각으로 hue 분배 (인접 그룹 색상이 충분히 떨어지도록)
  const golden = 137.50776405;
  sorted.forEach((name, i) => {
    const hue = (i * golden) % 360;
    map.set(name, {
      bg: `hsl(${hue}, 70%, 90%)`,
      text: `hsl(${hue}, 65%, 28%)`,
      ring: `hsl(${hue}, 60%, 78%)`,
    });
  });
  // total은 사용 안 하지만 서명 명확용
  void total;
  return map;
}

interface Person {
  group: string;
  name: string;
  phone: string; // 핸드폰 뒷자리
  company: string; // 상호명 (선택)
  region: string; // 권역 (선택)
  responseStatus?: string; // 응답상태 (예: "미응답")
  originalGroup?: string; // 1인 조 통합 시 원래 조 번호
}

interface TableSeat {
  group: string;
  name: string;
  phone: string;
  company: string;
  region: string;
  responseStatus?: string;
  originalGroup?: string;
}

export default function TeamBuilder() {
  const [people, setPeople] = useState<Person[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numTables, setNumTables] = useState<number>(37);
  const [seatsPerTable, setSeatsPerTable] = useState<number>(7);
  const [shuffleSeed, setShuffleSeed] = useState<number>(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [manualAssignment, setManualAssignment] = useState<{
    tables: TableSeat[][];
    splits: { group: string; tables: number[] }[];
    overflow: TableSeat[];
    totalGroups: number;
    remainingSolos: { i: number; group: string }[];
    singletonGroups: string[];
    unrespondedTableIndices: number[];
  } | null>(null);

  const groupColors = useMemo(
    () => buildGroupColorMap(people.map((p) => p.group)),
    [people],
  );

  function handleFile(file: File) {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

        // 컬럼 키 헬퍼
        const findKey = (r: Record<string, unknown>, regex: RegExp) =>
          Object.keys(r).find((k) => regex.test(k));

        // 첫 행에서 테이블번호 컬럼 있는지 감지 → 수동 배정 모드
        const firstRow = rows[0] ?? {};
        const tableNoKey = findKey(firstRow, /테이블번호|테이블 번호|table\s*no|table\s*num/i);
        const originalGroupKey = findKey(firstRow, /원래\s*조번호|원래\s*조|originalGroup|original/i);

        const parsed: Person[] = [];
        const manualTablesMap = new Map<number, TableSeat[]>();
        const manualOverflow: TableSeat[] = [];

        for (const r of rows) {
          const groupKey = findKey(r, /조번호|조|그룹|group|team|반/i);
          const nameKey = findKey(r, /이름|성명|name/i);
          const phoneKey = findKey(r, /핸드폰|폰|뒷|연락처|전화|phone|mobile|tel/i);
          const companyKey = findKey(r, /상호|업체|회사|company|brand|소속/i);
          const regionKey = findKey(r, /권역|지역|시도|시·도|구역|region|area|zone/i);
          const responseKey = findKey(r, /응답|상태|response|status/i);
          if (!groupKey || !nameKey) continue;
          const group = String(r[groupKey] ?? "").trim();
          const name = String(r[nameKey] ?? "").trim();
          const phone = phoneKey ? String(r[phoneKey] ?? "").trim() : "";
          const company = companyKey ? String(r[companyKey] ?? "").trim() : "";
          const region = regionKey ? String(r[regionKey] ?? "").trim() : "";
          const responseStatus = responseKey ? String(r[responseKey] ?? "").trim() || undefined : undefined;
          if (!group || !name) continue;
          const originalGroup = originalGroupKey
            ? String(r[originalGroupKey] ?? "").trim() || undefined
            : undefined;
          parsed.push({ group, name, phone, company, region, responseStatus, originalGroup });

          if (tableNoKey) {
            const seat: TableSeat = { group, name, phone, company, region, responseStatus, originalGroup };
            const tnumRaw = String(r[tableNoKey] ?? "").trim();
            const tn = parseInt(tnumRaw, 10);
            if (!isNaN(tn) && tn > 0) {
              if (!manualTablesMap.has(tn)) manualTablesMap.set(tn, []);
              manualTablesMap.get(tn)!.push(seat);
            } else {
              // (좌석부족) 같은 비숫자 → overflow
              manualOverflow.push(seat);
            }
          }
        }

        if (parsed.length === 0) {
          setError(
            "이름·조번호 컬럼을 찾을 수 없습니다. 첫 행이 헤더여야 합니다.",
          );
          return;
        }

        setPeople(parsed);
        setFileName(file.name);

        if (tableNoKey) {
          // 수동 배정 모드 — 테이블 배열 빌드 + manualAssignment 설정
          const maxTn = Math.max(0, ...manualTablesMap.keys());
          const tables: TableSeat[][] = [];
          for (let i = 1; i <= maxTn; i++) {
            tables.push(manualTablesMap.get(i) ?? []);
          }
          const groupSet = new Set<string>();
          for (const seats of tables) for (const s of seats) groupSet.add(s.group);
          for (const s of manualOverflow) groupSet.add(s.group);
          // 미응답 테이블 자동 감지: 모든 멤버가 미응답이면 미응답 테이블
          const unrespondedTableIndices: number[] = [];
          for (let i = 0; i < tables.length; i++) {
            if (
              tables[i].length > 0 &&
              tables[i].every(
                (s) => /미응답/.test(s.responseStatus ?? "") || /미응답/.test(s.group),
              )
            )
              unrespondedTableIndices.push(i);
          }
          setManualAssignment({
            tables,
            overflow: manualOverflow,
            splits: [],
            totalGroups: groupSet.size,
            remainingSolos: [],
            singletonGroups: [],
            unrespondedTableIndices,
          });
          setNumTables(maxTn);
        } else {
          // 자동 배정 모드 — 기존 알고리즘
          setManualAssignment(null);
        }
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
    const capacity = numTables * seatsPerTable;
    if (people.length > capacity) {
      issues.push({
        severity: "error",
        label: "🔴 좌석 부족",
        detail: `현재 ${people.length}명 / 가용 ${capacity}석 → ${
          people.length - capacity
        }명 자리 없음. 테이블 수를 ${Math.ceil(
          people.length / seatsPerTable,
        )}개 이상으로 늘리세요.`,
      });
    }

    // 6. 조별 인원 통계
    const groupSizes = new Map<string, number>();
    for (const p of people) {
      groupSizes.set(p.group, (groupSizes.get(p.group) ?? 0) + 1);
    }

    // 6.5. 1인 조 → 자동으로 "기타조" 로 통합되어 함께 앉음
    const singletons = [...groupSizes.entries()]
      .filter(([, n]) => n === 1)
      .map(([g]) => g);
    if (singletons.length > 0) {
      issues.push({
        severity: "warning",
        label: `ℹ️ 1인 조 ${singletons.length}개 → "기타조" 로 자동 통합`,
        detail: `${singletons.join(", ")}조 — 한 테이블에 같이 앉습니다 (이름 옆에 원래 조 번호 표시됨)`,
      });
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
  }, [people, numTables, seatsPerTable]);

  // 배정 알고리즘 (sort + 순차 채우기):
  //  1. 1인 조 → "기타조" 자동 통합
  //  2. 미응답 분리 (별도 테이블)
  //  3. 나머지를 조번호 → 권역 순 정렬
  //  4. 정렬 순서대로 N명씩 테이블 채우기 (꽉꽉)
  //  5. 미응답들도 정렬 후 별도 테이블에 채우기
  const computedAssignment = useMemo(() => {
    if (people.length === 0 || manualAssignment) return null;

    const MERGED_GROUP = "기타조";

    // seed 기반 PRNG
    let seed = shuffleSeed | 0 || 1;
    function rand(): number {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function shuffle<T>(arr: T[]): T[] {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // 권역을 큰 클러스터로 정규화
    function regionCluster(region: string): string {
      const r = (region ?? "").trim();
      if (!r) return "";
      if (
        r.includes("서울") ||
        r.includes("경기") ||
        r.includes("인천") ||
        r.includes("강북") ||
        r.includes("강남") ||
        r.includes("서남") ||
        r.includes("강원")
      )
        return "수도권";
      if (r.startsWith("충청") || r.startsWith("대전") || r.startsWith("세종"))
        return "충청";
      if (
        r.startsWith("영남") ||
        r.startsWith("부산") ||
        r.startsWith("대구") ||
        r.startsWith("울산") ||
        r.startsWith("경상")
      )
        return "영남";
      if (
        r.startsWith("호남") ||
        r.startsWith("광주") ||
        r.startsWith("전라") ||
        r.startsWith("전남") ||
        r.startsWith("전북")
      )
        return "호남";
      if (r.startsWith("제주")) return "제주";
      return r;
    }

    // 미응답 판정 — responseStatus 또는 조번호 에 "미응답" 포함되면 분리
    function isUnresponded(p: Person): boolean {
      if (/미응답/.test(p.responseStatus ?? "")) return true;
      if (/미응답/.test(p.group)) return true;
      return false;
    }

    // 1인 조 (size=1) 들은 같은 "기타조" 로 자동 통합 (미응답 제외)
    const groupCounts = new Map<string, number>();
    for (const p of people) {
      if (isUnresponded(p)) continue;
      groupCounts.set(p.group, (groupCounts.get(p.group) ?? 0) + 1);
    }
    const peopleProcessed: Person[] = people.map((p) => {
      if (isUnresponded(p)) return p;
      if (groupCounts.get(p.group) === 1) {
        return { ...p, group: MERGED_GROUP, originalGroup: p.group };
      }
      return p;
    });

    // 그룹 번호 헬퍼 (정렬용)
    function groupOrder(g: string): number {
      if (g === MERGED_GROUP) return Number.MAX_SAFE_INTEGER;
      const n = parseInt(g, 10);
      return isNaN(n) ? Number.MAX_SAFE_INTEGER - 1 : n;
    }

    // 정렬: 조번호 → 권역 클러스터 (같은 그룹 안에서는 권역끼리 묶이게)
    function sortPpl(arr: Person[]): Person[] {
      return shuffle(arr).sort((a, b) => {
        const oA = groupOrder(a.group);
        const oB = groupOrder(b.group);
        if (oA !== oB) return oA - oB;
        return regionCluster(a.region).localeCompare(regionCluster(b.region), "ko");
      });
    }

    // 미응답 분리
    const respondedPpl = peopleProcessed.filter((p) => !isUnresponded(p));
    const unrespondedPpl = peopleProcessed.filter((p) => isUnresponded(p));

    const sortedResponded = sortPpl(respondedPpl);
    const sortedUnresponded = sortPpl(unrespondedPpl);

    // 좌석 객체 변환
    const toSeat = (p: Person): TableSeat => ({
      group: p.group,
      name: p.name,
      phone: p.phone,
      company: p.company,
      region: p.region,
      responseStatus: p.responseStatus,
      originalGroup: p.originalGroup,
    });

    // N명씩 채우기 — 일반 테이블
    const tables: TableSeat[][] = [];
    for (let i = 0; i < sortedResponded.length; i += seatsPerTable) {
      tables.push(sortedResponded.slice(i, i + seatsPerTable).map(toSeat));
    }
    // 미응답 테이블 (별도)
    const unrespondedTableIndices: number[] = [];
    for (let i = 0; i < sortedUnresponded.length; i += seatsPerTable) {
      unrespondedTableIndices.push(tables.length);
      tables.push(sortedUnresponded.slice(i, i + seatsPerTable).map(toSeat));
    }

    // numTables 만큼 빈 테이블 패딩
    while (tables.length < numTables) tables.push([]);

    // 결과 메타 계산
    const groupTablesMap = new Map<string, Set<number>>();
    for (let i = 0; i < tables.length; i++) {
      for (const s of tables[i]) {
        if (!groupTablesMap.has(s.group)) groupTablesMap.set(s.group, new Set());
        groupTablesMap.get(s.group)!.add(i + 1);
      }
    }
    const splits = [...groupTablesMap.entries()]
      .filter(([, s]) => s.size > 1)
      .map(([g, s]) => ({ group: g, tables: [...s].sort((a, b) => a - b) }));

    const allGroups = new Set(peopleProcessed.map((p) => p.group));
    const singletonGroupNames = [...groupCounts.entries()]
      .filter(([, n]) => n === 1)
      .map(([g]) => g);

    return {
      tables,
      splits,
      overflow: [] as TableSeat[],
      totalGroups: allGroups.size,
      remainingSolos: [] as { i: number; group: string }[],
      singletonGroups: singletonGroupNames,
      unrespondedTableIndices,
    };
  }, [people, numTables, seatsPerTable, shuffleSeed, manualAssignment]);

  const assignment = manualAssignment ?? computedAssignment;

  function downloadExcel() {
    if (!assignment) return;
    const rows: {
      테이블번호: number | string;
      조번호: string;
      "원래 조번호": string;
      이름: string;
      권역: string;
      상호명: string;
      "핸드폰 뒷자리": string;
      응답상태: string;
      "테이블 종류": string;
    }[] = [];
    const unrIdxSet = new Set(assignment.unrespondedTableIndices ?? []);
    assignment.tables.forEach((seats, i) => {
      const tableType = unrIdxSet.has(i) ? "미응답" : "일반";
      for (const s of seats) {
        rows.push({
          테이블번호: i + 1,
          조번호: s.group,
          "원래 조번호": s.originalGroup ?? s.group,
          이름: s.name,
          권역: s.region,
          상호명: s.company,
          "핸드폰 뒷자리": s.phone,
          응답상태: s.responseStatus ?? "",
          "테이블 종류": tableType,
        });
      }
    });
    if (assignment.overflow.length > 0) {
      for (const s of assignment.overflow) {
        rows.push({
          테이블번호: "(좌석부족)",
          조번호: s.group,
          "원래 조번호": s.originalGroup ?? s.group,
          이름: s.name,
          권역: s.region,
          상호명: s.company,
          "핸드폰 뒷자리": s.phone,
          응답상태: s.responseStatus ?? "",
          "테이블 종류": "좌석부족",
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
    <main className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 p-4 md:p-8">
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
        <div className="flex flex-wrap items-center gap-4">
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
            <span className="text-xs text-zinc-500">개</span>
          </label>
          <div className="inline-flex items-center gap-2 text-sm text-zinc-700">
            테이블당 인원
            <div className="flex rounded-full bg-zinc-100 p-0.5">
              {[7, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSeatsPerTable(n)}
                  className={
                    seatsPerTable === n
                      ? "rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white"
                      : "rounded-full px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-200"
                  }
                >
                  {n}명
                </button>
              ))}
            </div>
          </div>
          <span className="text-xs text-zinc-400">
            가용 좌석 {numTables * seatsPerTable}석
          </span>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">
          2️⃣ 엑셀 업로드
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          엑셀 파일에 <code>조번호</code>, <code>이름</code>, <code>권역</code>(선택), <code>응답상태</code>(선택, "미응답" 표기 시 별도 테이블), <code>상호명</code>(선택), <code>핸드폰 뒷자리</code> 컬럼이 있어야 합니다. 첫 행이 헤더, 컬럼 순서는 자유.
          <br />
          <span className="text-blue-600">
            💡 <code>테이블번호</code> 컬럼이 있으면 자동 배정 건너뛰고 <b>그 배치 그대로 시각화</b> (수동 편집한 엑셀 다시 업로드 가능)
          </span>
        </p>
        {manualAssignment && (
          <div className="mb-3 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-800 ring-1 ring-blue-200">
            ✏️ 수동 배정 모드 — 업로드한 테이블번호 그대로 사용 중. 자동 재계산 안 함.{" "}
            <button
              type="button"
              onClick={() => setManualAssignment(null)}
              className="ml-2 underline hover:text-blue-600"
            >
              자동 모드로 전환
            </button>
          </div>
        )}
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
                <th className="border border-zinc-300 bg-white px-3 py-1 text-left">권역</th>
                <th className="border border-zinc-300 bg-white px-3 py-1 text-left">상호명</th>
                <th className="border border-zinc-300 bg-white px-3 py-1 text-left">핸드폰 뒷자리</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-zinc-300 px-3 py-1">A</td>
                <td className="border border-zinc-300 px-3 py-1">홍길동</td>
                <td className="border border-zinc-300 px-3 py-1">수도권</td>
                <td className="border border-zinc-300 px-3 py-1">까페 모카</td>
                <td className="border border-zinc-300 px-3 py-1">1234</td>
              </tr>
              <tr>
                <td className="border border-zinc-300 px-3 py-1">A</td>
                <td className="border border-zinc-300 px-3 py-1">김철수</td>
                <td className="border border-zinc-300 px-3 py-1">수도권</td>
                <td className="border border-zinc-300 px-3 py-1">까페 모카</td>
                <td className="border border-zinc-300 px-3 py-1">5678</td>
              </tr>
              <tr>
                <td className="border border-zinc-300 px-3 py-1">B</td>
                <td className="border border-zinc-300 px-3 py-1">박영희</td>
                <td className="border border-zinc-300 px-3 py-1">영남</td>
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
                {!manualAssignment && (
                  <button
                    type="button"
                    onClick={() => setShuffleSeed(Date.now())}
                    className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1.5 text-xs hover:bg-zinc-200"
                  >
                    <Shuffle size={12} /> 다시 계산
                  </button>
                )}
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

            {assignment.remainingSolos.length > 0 && (
              <div className="mb-3 rounded-xl bg-orange-50 px-3 py-2 text-xs text-orange-800 ring-1 ring-orange-200">
                ⚠️ 후처리에도 남은 1명 케이스 ({assignment.remainingSolos.length}건) — 좌석 배치가 빡빡해서 자동으로 못 합쳤습니다. 테이블 수를 늘리거나 수동 조정이 필요합니다:
                <ul className="mt-1 list-disc pl-4">
                  {assignment.remainingSolos.map((s, idx) => (
                    <li key={idx}>
                      <b>{s.group}조</b> @ 테이블 {s.i + 1}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {assignment.singletonGroups.length > 0 && (
              <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800 ring-1 ring-amber-200">
                ℹ️ 1인 조 {assignment.singletonGroups.length}개 ({assignment.singletonGroups.join(", ")}) → "기타조" 로 자동 통합되어 한 테이블에 함께 앉습니다.
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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7">
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
                  { name: string; phone: string; company: string; region: string; originalGroup?: string }[]
                >();
                for (const s of seats) {
                  if (!byGroup.has(s.group)) byGroup.set(s.group, []);
                  byGroup.get(s.group)!.push({
                    name: s.name,
                    phone: s.phone,
                    company: s.company,
                    region: s.region,
                    originalGroup: s.originalGroup,
                  });
                }
                const isFull = seats.length === seatsPerTable;
                const isUnrespondedTable = assignment.unrespondedTableIndices?.includes(i) ?? false;
                return (
                  <div
                    key={i}
                    className={
                      isUnrespondedTable
                        ? "rounded-2xl border-2 border-dashed border-orange-300 bg-orange-50/40 p-4 shadow-sm"
                        : "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
                    }
                  >
                    <div className="mb-3 flex items-baseline justify-between border-b border-zinc-100 pb-2">
                      <h3
                        className={
                          isUnrespondedTable
                            ? "text-base font-bold text-orange-700"
                            : "text-base font-bold text-zinc-900"
                        }
                      >
                        {isUnrespondedTable ? "❓ 미응답 테이블" : `🪑 테이블 ${i + 1}`}
                      </h3>
                      <span
                        className={
                          isFull
                            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                            : "rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600"
                        }
                      >
                        {seats.length}/{seatsPerTable}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {[...byGroup.entries()].map(([g, members]) => {
                        const c = groupColors.get(g) ?? {
                          bg: "#f4f4f5",
                          text: "#3f3f46",
                          ring: "#e4e4e7",
                        };
                        return (
                        <div key={g}>
                          <div
                            className="mb-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1"
                            style={{
                              backgroundColor: c.bg,
                              color: c.text,
                              boxShadow: `0 0 0 1px ${c.ring}`,
                            }}
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
                                    className="shrink-0 rounded px-1 py-0.5 text-[10px] font-bold"
                                    style={{
                                      backgroundColor: c.bg,
                                      color: c.text,
                                    }}
                                  >
                                    {g}조
                                  </span>
                                  <span className="font-medium text-zinc-800">
                                    {m.name}
                                  </span>
                                  {m.originalGroup && m.originalGroup !== g && (
                                    <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] text-amber-700 ring-1 ring-amber-200">
                                      원: {m.originalGroup}조
                                    </span>
                                  )}
                                  {m.region && (
                                    <span className="rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-700 ring-1 ring-blue-200">
                                      {m.region}
                                    </span>
                                  )}
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
                        );
                      })}
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
