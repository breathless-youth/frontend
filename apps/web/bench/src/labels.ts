/**
 * 정답 라벨 — 영상 한 개의 시간 구간마다 실제 상태를 적는다.
 *
 * 형식(CSV, 첫 줄 헤더 선택):
 *
 *   file,start,end,label
 *   clip01.mp4,0,35.5,FOCUS
 *   clip01.mp4,0:35.5,1:00,PHONE
 *
 * - `file`은 영상 파일명(확장자 무시). 영상이 하나뿐이거나 클립별 입력칸에 붙여 넣으면 생략한다.
 * - 시간은 초(`35.5`) 또는 `분:초`(`0:35.5`), `시:분:초`.
 * - 라벨: FOCUS/AWAY/PHONE/SLEEP — 한글(집중/자리이탈/휴대폰/졸음)도 받는다.
 * - JSON도 받는다: `{ "clip01.mp4": [{ "start": 0, "end": 35.5, "label": "FOCUS" }] }`.
 */

export const BENCH_CLASSES = ["FOCUS", "AWAY", "PHONE", "SLEEP"] as const;
export type BenchClass = (typeof BENCH_CLASSES)[number];

export interface LabelSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly label: BenchClass;
}

const LABEL_ALIASES: Record<string, BenchClass> = {
  focus: "FOCUS",
  focused: "FOCUS",
  study: "FOCUS",
  집중: "FOCUS",
  공부: "FOCUS",
  away: "AWAY",
  absent: "AWAY",
  자리이탈: "AWAY",
  이탈: "AWAY",
  부재: "AWAY",
  phone: "PHONE",
  "cell phone": "PHONE",
  휴대폰: "PHONE",
  폰: "PHONE",
  sleep: "SLEEP",
  drowsy: "SLEEP",
  졸음: "SLEEP",
  수면: "SLEEP",
};

export function parseLabel(raw: string): BenchClass | null {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
  return LABEL_ALIASES[key] ?? LABEL_ALIASES[key.replace(/ /g, "")] ?? null;
}

/** `35.5` · `0:35.5` · `1:02:03` → ms. 못 읽으면 null. */
export function parseTimeMs(raw: string | number): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 1000) : null;
  }
  const text = raw.trim();
  if (text === "") {
    return null;
  }
  const parts = text.split(":");
  if (parts.length > 3) {
    return null;
  }
  let seconds = 0;
  for (const part of parts) {
    const value = Number(part);
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    seconds = seconds * 60 + value;
  }
  return Math.round(seconds * 1000);
}

/** 확장자·경로를 뗀 소문자 이름. 영상과 라벨을 이 값으로 잇는다. */
export function clipKey(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base
    .replace(/\.(labels?|gt)?\.?(csv|json|txt)$/i, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase();
}

export interface ParsedLabels {
  /** clipKey → 구간. 파일 열이 없던 줄은 `""` 키로 모인다. */
  readonly byClip: Map<string, LabelSegment[]>;
  readonly errors: string[];
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if ((ch === "," || ch === "\t" || ch === ";") && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function push(map: Map<string, LabelSegment[]>, key: string, segment: LabelSegment): void {
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, [segment]);
  } else {
    list.push(segment);
  }
}

function parseJson(text: string): ParsedLabels {
  const byClip = new Map<string, LabelSegment[]>();
  const errors: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error: unknown) {
    return { byClip, errors: [`JSON을 읽지 못했습니다: ${String(error)}`] };
  }
  const entries: [string, unknown][] = Array.isArray(data)
    ? [["", data]]
    : typeof data === "object" && data !== null
      ? Object.entries(data)
      : [];
  for (const [file, list] of entries) {
    if (!Array.isArray(list)) {
      errors.push(`${file}: 구간 배열이 아닙니다`);
      continue;
    }
    list.forEach((item: unknown, index) => {
      const row = item as { start?: unknown; end?: unknown; label?: unknown; file?: unknown };
      const startMs = parseTimeMs(row.start as string | number);
      const endMs = parseTimeMs(row.end as string | number);
      const label = typeof row.label === "string" ? parseLabel(row.label) : null;
      const key = clipKey(typeof row.file === "string" ? row.file : file);
      if (startMs === null || endMs === null || label === null || endMs <= startMs) {
        errors.push(`${file || "(파일 없음)"} #${index + 1}: 구간을 읽지 못했습니다`);
        return;
      }
      push(byClip, key, { startMs, endMs, label });
    });
  }
  return { byClip, errors };
}

export function parseLabels(text: string): ParsedLabels {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJson(trimmed);
  }
  const byClip = new Map<string, LabelSegment[]>();
  const errors: string[] = [];
  const lines = trimmed
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));
  let columns: { file: number; start: number; end: number; label: number } | null = null;
  lines.forEach((line, index) => {
    const cells = splitCsvLine(line);
    const lower = cells.map((cell) => cell.toLowerCase());
    if (index === 0 && lower.includes("start") && lower.includes("label")) {
      columns = {
        file: lower.findIndex((cell) => cell === "file" || cell === "clip" || cell === "video"),
        start: lower.indexOf("start"),
        end: lower.indexOf("end"),
        label: lower.indexOf("label"),
      };
      return;
    }
    const cols =
      columns ??
      (cells.length >= 4
        ? { file: 0, start: 1, end: 2, label: 3 }
        : { file: -1, start: 0, end: 1, label: 2 });
    const startMs = parseTimeMs(cells[cols.start] ?? "");
    const endMs = parseTimeMs(cells[cols.end] ?? "");
    const label = parseLabel(cells[cols.label] ?? "");
    if (startMs === null || endMs === null || label === null || endMs <= startMs) {
      errors.push(`${index + 1}번째 줄을 읽지 못했습니다: ${line}`);
      return;
    }
    const key = cols.file >= 0 ? clipKey(cells[cols.file] ?? "") : "";
    push(byClip, key, { startMs, endMs, label });
  });
  for (const list of byClip.values()) {
    list.sort((a, b) => a.startMs - b.startMs);
  }
  return { byClip, errors };
}

/** 라벨이 걸린 시각의 정답. 겹치면 나중 줄이 이긴다. 라벨이 없으면 null(지표에서 빠진다). */
export function labelAt(segments: readonly LabelSegment[], atMs: number): BenchClass | null {
  let found: BenchClass | null = null;
  for (const segment of segments) {
    if (atMs >= segment.startMs && atMs < segment.endMs) {
      found = segment.label;
    }
  }
  return found;
}

export const LABEL_TEMPLATE = `file,start,end,label
clip01.mp4,0,45,FOCUS
clip01.mp4,45,70,PHONE
clip01.mp4,70,95,AWAY
clip01.mp4,95,180,SLEEP
`;
