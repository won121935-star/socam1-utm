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
  const [shuffleSeed, setShuffleSeed] = useState<number>(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

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

    // 6.5. 1인 조 = 어느 테이블에 가도 혼자 (본질적 solo)
    const singletons = [...groupSizes.entries()]
      .filter(([, n]) => n === 1)
      .map(([g]) => g);
    if (singletons.length > 0) {
      issues.push({
        severity: "warning",
        label: "🟡 1인 조 (어느 테이블이든 혼자 앉음)",
        detail: `${singletons.join(", ")}조 (${singletons.length}개) — 멤버가 1명이라 다른 조와 합치지 않으면 어디서든 혼자입니다.`,
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
  }, [people, numTables]);

  // 배정 알고리즘:
  //  1. 모든 atom (chunk) 을 size ≥ 2 로 보장 (1인 조만 예외 — 본질적 solo)
  //  2. FFD (Best-Fit Decreasing) 으로 atom 배치, 안 들어가면 sz≥4 일 때만 절반 분할
  //  3. 1인 조는 같은 조 있는 테이블 우선, 없으면 빈 자리
  //  4. 후처리: 직접 이동 + 안전 swap 으로 solo (조 인원 1명) 제거
  const assignment = useMemo(() => {
    if (people.length === 0) return null;

    type Member = { name: string; phone: string; company: string };
    type Atom = { group: string; members: Member[] };

    // seed 기반 PRNG (shuffleSeed 가 같으면 같은 결과, 다르면 다른 배치)
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

    const groupsMap = new Map<string, Member[]>();
    for (const p of people) {
      if (!groupsMap.has(p.group)) groupsMap.set(p.group, []);
      groupsMap
        .get(p.group)!
        .push({ name: p.name, phone: p.phone, company: p.company });
    }
    // 그룹 내 멤버 순서 셔플 (같은 조 안에서 누가 어느 청크로 갈지 다양화)
    for (const [name, members] of groupsMap) {
      groupsMap.set(name, shuffle(members));
    }
    const groupTotalSize = (g: string) => groupsMap.get(g)?.length ?? 0;

    // 8명 초과 그룹은 균등 분할 (각 ≥ 2 보장: numChunks=ceil(s/8) 이므로 base ≥ 2)
    function evenChunks(size: number): number[] {
      if (size <= SEATS_PER_TABLE) return [size];
      const numChunks = Math.ceil(size / SEATS_PER_TABLE);
      const base = Math.floor(size / numChunks);
      const extra = size % numChunks;
      return Array.from({ length: numChunks }, (_, i) =>
        i < extra ? base + 1 : base,
      );
    }

    // 1. atom 분리: ≥2 (bigAtoms) / =1 (singletons, 본질적 1인 조)
    const bigAtoms: Atom[] = [];
    const singletons: Atom[] = [];
    for (const [name, members] of groupsMap) {
      if (members.length === 1) {
        singletons.push({ group: name, members: [...members] });
        continue;
      }
      const sizes = evenChunks(members.length);
      let idx = 0;
      for (const sz of sizes) {
        bigAtoms.push({ group: name, members: members.slice(idx, idx + sz) });
        idx += sz;
      }
    }

    const tables: TableSeat[][] = Array.from({ length: numTables }, () => []);
    const overflow: TableSeat[] = [];

    function placeMember(table: TableSeat[], group: string, m: Member) {
      table.push({ group, name: m.name, phone: m.phone, company: m.company });
    }

    // 2. FFD - bigAtoms 배치 (셔플 후 size desc 정렬 — 동일 size 내에서 순서 랜덤화)
    const queue: Atom[] = shuffle(bigAtoms).sort(
      (a, b) => b.members.length - a.members.length,
    );
    while (queue.length > 0) {
      const atom = queue.shift()!;
      const sz = atom.members.length;

      // best-fit: 같은 조 있는 테이블 먼저, 없으면 일반 best-fit
      let bestIdx = -1;
      let bestSpace = Infinity;
      for (let i = 0; i < tables.length; i++) {
        const sp = SEATS_PER_TABLE - tables[i].length;
        if (
          sp >= sz &&
          tables[i].some((s) => s.group === atom.group) &&
          sp < bestSpace
        ) {
          bestSpace = sp;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) {
        for (let i = 0; i < tables.length; i++) {
          const sp = SEATS_PER_TABLE - tables[i].length;
          if (sp >= sz && sp < bestSpace) {
            bestSpace = sp;
            bestIdx = i;
          }
        }
      }
      if (bestIdx !== -1) {
        for (const m of atom.members) placeMember(tables[bestIdx], atom.group, m);
        continue;
      }

      // 통째로 못 넣음 → sz≥4 면 절반 분할 (각 ≥2 유지)
      if (sz >= 4) {
        const half = Math.ceil(sz / 2);
        queue.push({
          group: atom.group,
          members: atom.members.slice(0, half),
        });
        queue.push({ group: atom.group, members: atom.members.slice(half) });
        queue.sort((a, b) => b.members.length - a.members.length);
        continue;
      }

      // sz=2 or 3 인데 통째도 안 됨 → 개별 배치 (post-process 가 solo 정리)
      for (const m of atom.members) {
        let placedIdx = -1;
        for (let i = 0; i < tables.length; i++) {
          if (
            SEATS_PER_TABLE - tables[i].length >= 1 &&
            tables[i].some((s) => s.group === atom.group)
          ) {
            placedIdx = i;
            break;
          }
        }
        if (placedIdx === -1) {
          placedIdx = tables.findIndex((t) => t.length < SEATS_PER_TABLE);
        }
        if (placedIdx !== -1) {
          placeMember(tables[placedIdx], atom.group, m);
        } else {
          overflow.push({
            group: atom.group,
            name: m.name,
            phone: m.phone,
            company: m.company,
          });
        }
      }
    }

    // 3. singletons (1인 조) 배치
    for (const atom of singletons) {
      const m = atom.members[0];
      let idx = -1;
      for (let i = 0; i < tables.length; i++) {
        if (
          SEATS_PER_TABLE - tables[i].length >= 1 &&
          tables[i].some((s) => s.group === atom.group)
        ) {
          idx = i;
          break;
        }
      }
      if (idx === -1) {
        idx = tables.findIndex((t) => t.length < SEATS_PER_TABLE);
      }
      if (idx !== -1) {
        placeMember(tables[idx], atom.group, m);
      } else {
        overflow.push({
          group: atom.group,
          name: m.name,
          phone: m.phone,
          company: m.company,
        });
      }
    }

    // 4. 후처리: solo (조 인원 1명) 제거. 1인 조는 본질적 solo 라 제외.
    function findSolos(): Array<{ i: number; group: string }> {
      const out: Array<{ i: number; group: string }> = [];
      for (let i = 0; i < tables.length; i++) {
        const counts = new Map<string, number>();
        for (const s of tables[i])
          counts.set(s.group, (counts.get(s.group) ?? 0) + 1);
        for (const [g, n] of counts) {
          if (n === 1 && groupTotalSize(g) > 1) {
            out.push({ i, group: g });
          }
        }
      }
      return out;
    }

    for (let pass = 0; pass < 500; pass++) {
      const solos = findSolos();
      if (solos.length === 0) break;
      let changed = false;

      for (const { i, group: g } of solos) {
        const seatIdx = tables[i].findIndex((s) => s.group === g);
        if (seatIdx === -1) continue;

        // 1) 직접 이동: 같은 조 + 자리 있는 테이블로 (P 가 빠지면 i 의 G solo 해소)
        let moved = false;
        for (let j = 0; j < tables.length; j++) {
          if (j === i) continue;
          if (SEATS_PER_TABLE - tables[j].length < 1) continue;
          if (!tables[j].some((s) => s.group === g)) continue;
          const seat = tables[i].splice(seatIdx, 1)[0];
          tables[j].push(seat);
          moved = true;
          changed = true;
          break;
        }
        if (moved) break;

        // 2) Swap: i 의 P (조 g) ↔ j 의 K (조 H, H≠g). 새로운 solo 안 만드는 조건만.
        const countsI = new Map<string, number>();
        for (const s of tables[i])
          countsI.set(s.group, (countsI.get(s.group) ?? 0) + 1);

        let swapped = false;
        for (let j = 0; j < tables.length && !swapped; j++) {
          if (j === i) continue;
          if (!tables[j].some((s) => s.group === g)) continue;
          const countsJ = new Map<string, number>();
          for (const s of tables[j])
            countsJ.set(s.group, (countsJ.get(s.group) ?? 0) + 1);

          for (let k = 0; k < tables[j].length; k++) {
            const K = tables[j][k];
            if (K.group === g) continue;
            const H = K.group;
            const hAtI = countsI.get(H) ?? 0;
            const hAtJ = countsJ.get(H) ?? 0;
            // K 가 i 로 이동 시 i 에 H solo 가 안 되려면 hAtI ≥ 1 (H가 1인 조라면 어차피 본질적 solo)
            if (hAtI < 1 && groupTotalSize(H) > 1) continue;
            // K 가 j 에서 빠지면 j 의 H = hAtJ - 1. 이 값이 1 이면 새 solo (H가 1인 조 제외)
            if (hAtJ === 2 && groupTotalSize(H) > 1) continue;

            const P = tables[i][seatIdx];
            tables[i][seatIdx] = K;
            tables[j][k] = P;
            changed = true;
            swapped = true;
            break;
          }
        }
        if (swapped) break;

        // 3) 3-way 체인 이동:
        //    i 에서 X(조 H≠g) 한 명을 m 으로 보내 자리 1 만들고,
        //    j 의 Q(조 g)를 i 로 옮겨 P 와 합쳐 solo 해소.
        //    조건: H@i ≥ 3 (i 에서 X 빠져도 solo 안 남), G@j ≥ 3 (j 에서 Q 빠져도 solo 안 남),
        //         H@m ≥ 1 (m 에서 X 가 새 solo 안 됨).
        let chained = false;
        for (let j = 0; j < tables.length && !chained; j++) {
          if (j === i) continue;
          const gAtJ = tables[j].filter((s) => s.group === g).length;
          if (gAtJ < 3) continue;

          for (let xIdx = 0; xIdx < tables[i].length && !chained; xIdx++) {
            const X = tables[i][xIdx];
            if (X.group === g) continue;
            const H = X.group;
            const hAtI = countsI.get(H) ?? 0;
            if (hAtI < 3 && groupTotalSize(H) > 1) continue;

            for (let m = 0; m < tables.length; m++) {
              if (m === i || m === j) continue;
              if (SEATS_PER_TABLE - tables[m].length < 1) continue;
              const hAtM = tables[m].filter((s) => s.group === H).length;
              if (hAtM < 1 && groupTotalSize(H) > 1) continue;

              const qIdx = tables[j].findIndex((s) => s.group === g);
              if (qIdx === -1) continue;

              const Xseat = tables[i][xIdx];
              const Qseat = tables[j][qIdx];
              tables[i][xIdx] = Qseat;
              tables[j].splice(qIdx, 1);
              tables[m].push(Xseat);

              changed = true;
              chained = true;
              break;
            }
          }
        }
        if (chained) break;
      }

      if (!changed) break;
    }

    // 5. splits (한 조가 여러 테이블에 분산됨) 계산
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

    const remainingSolos = findSolos();
    const singletonGroupNames = [...groupsMap.entries()]
      .filter(([, m]) => m.length === 1)
      .map(([g]) => g);

    return {
      tables,
      splits,
      overflow,
      totalGroups: groupsMap.size,
      remainingSolos,
      singletonGroups: singletonGroupNames,
    };
  }, [people, numTables, shuffleSeed]);

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
                  onClick={() => setShuffleSeed(Date.now())}
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
                ℹ️ 본질적 1인 조 ({assignment.singletonGroups.length}개): {assignment.singletonGroups.join(", ")} — 이 조는 입력 자체가 1명이라 어떤 알고리즘으로도 혼자 앉을 수밖에 없습니다.
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
