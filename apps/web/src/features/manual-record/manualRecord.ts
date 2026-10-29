import type { StudySessionSummary, SubjectRef } from "@focusmakers/types";

import { formatDuration, formatKstClock, kstDateKey } from "@/features/records/recordsFormat";
import { kstDayStartMs } from "@/features/records/recordsTimetable";

/**
 * 수동 기록 입력 화면의 계산
 *
 * 기본값, 검증, 겹침 자르기 미리보기, 묶음 찾기, 낭독 문장을 화면 없이 계산한다.
 * 서버가 같은 규칙으로 최종 조각을 정하므로 여기서 자른 결과는 미리보기다.
 * 시각은 epoch ms로 다루고, 날짜와 시계 표기는 KST다.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** 지난 날에 그날 기록이 없을 때 시작 시각(KST 시). */
const PAST_DAY_START_HOUR = 9;

export const MANUAL_RECORD_COPY = {
  tooShort: "1분 이상이어야 해요",
  future: "지금 이후 시간은 넣을 수 없어요",
  allOverlap: "이미 기록이 있는 시간이에요",
  failed: "저장하지 못했어요. 다시 시도해 주세요",
  noSubject: "과목 없음",
} as const;

export interface ManualSpan {
  startMs: number;
  endMs: number;
}

/** 입력 화면을 연 방법. 수정·삭제는 기존 기록을 눌러 열어 버튼 입구가 없다. */
export type ManualRecordMode =
  | {
      kind: "add";
      entry: "planner_button" | "planner_cell" | "records" | "home";
      startMs?: number;
      /** 처음 고른 과목. 홈 과목 카드에서 열 때 넘긴다. */
      subjectId?: number;
    }
  | { kind: "edit"; entry: "planner_cell" | "records"; bundle: readonly StudySessionSummary[] };

export type SpanError = "too-short" | "future";

function floorMinute(ms: number): number {
  return Math.floor(ms / MINUTE_MS) * MINUTE_MS;
}

function ceilMinute(ms: number): number {
  return Math.ceil(ms / MINUTE_MS) * MINUTE_MS;
}

export function spanOf(session: Pick<StudySessionSummary, "startedAt" | "endedAt">): ManualSpan {
  return { startMs: Date.parse(session.startedAt), endMs: Date.parse(session.endedAt) };
}

export function isManualSession(session: Pick<StudySessionSummary, "source">): boolean {
  return session.source === "MANUAL";
}

/** epoch ms → KST `HH:MM`. 시각 입력칸의 값과 같은 꼴이다. */
export function clockOf(ms: number): string {
  return formatKstClock(new Date(ms).toISOString());
}

export function spanMinutes(spans: readonly ManualSpan[]): number {
  return Math.round(spans.reduce((sum, span) => sum + span.endMs - span.startMs, 0) / MINUTE_MS);
}

/** 오늘 달력 날짜에서 기록 날짜까지의 날 수(오늘 0). */
export function daysAgo(dateKey: string, todayKey: string): number {
  return Math.round((kstDayStartMs(todayKey) - kstDayStartMs(dateKey)) / DAY_MS);
}

/**
 * 입력 화면을 열 때의 구간
 *
 * 빈 칸 탭은 칸 시각부터 1시간이되 다음 기록 시작이나 지금이 더 이르면 거기서 끝낸다.
 * 오늘은 지금에서 끝나고, 1시간 전과 그날 마지막 기록 종료 중 늦은 쪽에서 시작한다.
 * 지난 날은 그날 마지막 기록 종료(없으면 09:00)부터 1시간이되 지금을 넘지 않는다.
 * 마지막 기록은 측정·수동을 가리지 않고, 초가 있는 측정 종료는 분 단위로 올려 겹치지 않게 한다.
 * 올린 종료가 지금이나 그날 끝을 넘을 수 있어 시작은 종료 뒤로, 날짜는 다음 날로 가지 않게 막는다.
 */
export function defaultSpan(input: {
  dateKey: string;
  todayKey: string;
  nowMs: number;
  sessions: readonly StudySessionSummary[];
  cellStartMs?: number;
}): ManualSpan {
  const spans = input.sessions.map(spanOf);
  const nowFloorMs = floorMinute(input.nowMs);

  if (input.cellStartMs !== undefined) {
    const startMs = input.cellStartMs;
    const nextStarts = spans.map((span) => span.startMs).filter((ms) => ms > startMs);
    return { startMs, endMs: floorMinute(Math.min(startMs + HOUR_MS, nowFloorMs, ...nextStarts)) };
  }

  const dayStartMs = kstDayStartMs(input.dateKey);
  const ends = spans
    .map((span) => span.endMs)
    .filter((ms) => ms > dayStartMs && ms <= dayStartMs + DAY_MS);
  const lastEndMs = ends.length === 0 ? null : ceilMinute(Math.max(...ends));

  if (input.dateKey === input.todayKey) {
    const startMs = Math.min(
      Math.max(nowFloorMs - HOUR_MS, lastEndMs ?? dayStartMs, dayStartMs),
      nowFloorMs,
    );
    return { startMs, endMs: nowFloorMs };
  }
  const startMs = Math.min(
    lastEndMs ?? dayStartMs + PAST_DAY_START_HOUR * HOUR_MS,
    dayStartMs + DAY_MS - MINUTE_MS,
  );
  return { startMs, endMs: Math.min(startMs + HOUR_MS, nowFloorMs) };
}

function clockMs(clock: string): number {
  const [hour = 0, minute = 0] = clock.split(":").map(Number);
  return hour * HOUR_MS + minute * MINUTE_MS;
}

/** 시각 입력칸 두 값 → 구간. 종료가 시작보다 이르면 다음 날 새벽으로 읽는다. */
export function spanFromClocks(dateKey: string, startClock: string, endClock: string): ManualSpan {
  const dayStartMs = kstDayStartMs(dateKey);
  const startMs = dayStartMs + clockMs(startClock);
  const endMs = dayStartMs + clockMs(endClock);
  // 같으면 길이 0으로 두어 검증이 막게 한다. 24시간 기록으로 읽지 않는다.
  return { startMs, endMs: endMs < startMs ? endMs + DAY_MS : endMs };
}

export function endsNextDay(span: ManualSpan, dateKey: string): boolean {
  return span.endMs >= kstDayStartMs(dateKey) + DAY_MS;
}

/** 서버 검증과 같은 순서다. 미래 판정에는 측정 제출과 달리 시계 오차 여유를 두지 않는다. */
export function validateSpan(span: ManualSpan, nowMs: number): SpanError | null {
  if (span.endMs - span.startMs < MINUTE_MS) {
    return "too-short";
  }
  return span.endMs > nowMs ? "future" : null;
}

/** 시각 입력칸이 24시간 기록을 만들지 않으므로 칩도 같은 상한에서 멈춘다. */
function chipCapMs(span: ManualSpan, nowMs: number): number {
  return Math.min(floorMinute(nowMs), span.startMs + DAY_MS - MINUTE_MS);
}

/** 칩 길이를 종료에 더한다. 지금이나 24시간 직전을 넘으면 거기서 멈춘다. */
export function applyChip(span: ManualSpan, minutes: number, nowMs: number): ManualSpan {
  return {
    startMs: span.startMs,
    endMs: Math.min(span.endMs + minutes * MINUTE_MS, chipCapMs(span, nowMs)),
  };
}

/** 종료가 지금이나 24시간 직전에 닿았는가. 닿으면 칩을 끈다. */
export function reachedNow(span: ManualSpan, nowMs: number): boolean {
  return span.endMs >= chipCapMs(span, nowMs);
}

/** 겹침을 따질 다른 기록. 수정이면 자기 묶음은 뺀다. */
export function othersForOverlap(
  sessions: readonly StudySessionSummary[],
  exclude: readonly StudySessionSummary[] = [],
): ManualSpan[] {
  const excluded = new Set(exclude.map((session) => session.id));
  return sessions.filter((session) => !excluded.has(session.id)).map(spanOf);
}

/**
 * 다른 기록과 겹치는 구간을 빼고 남는 조각
 *
 * 끝이 닿기만 한 것은 겹침이 아니다.
 * 측정 기록은 초가 있어 남는 조각의 시작은 올리고 끝은 내려 분 단위로 맞춘다.
 * 1분 미만 조각은 버리고, 빈 배열이면 전부 겹친 것이다.
 */
export function trimOverlaps(span: ManualSpan, others: readonly ManualSpan[]): ManualSpan[] {
  let pieces: ManualSpan[] = [span];
  for (const other of others) {
    pieces = pieces.flatMap((piece) => {
      if (other.endMs <= piece.startMs || other.startMs >= piece.endMs) {
        return [piece];
      }
      const rest: ManualSpan[] = [];
      if (other.startMs > piece.startMs) {
        rest.push({ startMs: piece.startMs, endMs: other.startMs });
      }
      if (other.endMs < piece.endMs) {
        rest.push({ startMs: other.endMs, endMs: piece.endMs });
      }
      return rest;
    });
  }
  return pieces
    .map((piece) => ({ startMs: ceilMinute(piece.startMs), endMs: floorMinute(piece.endMs) }))
    .filter((piece) => piece.endMs - piece.startMs >= MINUTE_MS);
}

/**
 * 일부 겹침 안내 문장
 *
 * 빠지는 시간은 입력한 길이와 남는 조각 합의 차이라, 버린 1분 미만 조각과 분 맞춤도 함께 센다.
 * 구간은 가장 이른 것 하나만 적는다.
 * 겹침이 없거나 남는 조각이 없으면 null이다.
 */
export function overlapNotice(span: ManualSpan, pieces: readonly ManualSpan[]): string | null {
  const savedMs = pieces.reduce((sum, piece) => sum + piece.endMs - piece.startMs, 0);
  const removedMs = span.endMs - span.startMs - savedMs;
  const first = pieces[0];
  if (first === undefined || removedMs <= 0) {
    return null;
  }
  const gap =
    first.startMs > span.startMs
      ? { startMs: span.startMs, endMs: first.startMs }
      : { startMs: first.endMs, endMs: pieces[1]?.startMs ?? span.endMs };
  return `이미 기록된 ${formatDuration(removedMs / 1000)}(${clockOf(gap.startMs)}~${clockOf(gap.endMs)})은 제외하고 ${formatDuration(savedMs / 1000)}을 저장해요`;
}

/**
 * 한 번에 저장한 조각 묶음
 *
 * 조각 하나만 열어 수정하면 서버가 묶음 전체를 다시 만들어 다른 조각이 사라지므로 묶음으로 연다.
 * 키를 싣지 않는 서버의 응답이거나 측정 세션이면 그 조각 하나가 묶음이다.
 */
export function bundleOf(
  sessions: readonly StudySessionSummary[],
  id: number,
): StudySessionSummary[] {
  const target = sessions.find((session) => session.id === id);
  if (target === undefined) {
    return [];
  }
  const key = target.submissionStartedAt;
  if (!isManualSession(target) || key === undefined) {
    return [target];
  }
  const keyMs = Date.parse(key);
  return sessions
    .filter(
      (session) =>
        isManualSession(session) &&
        session.submissionStartedAt !== undefined &&
        Date.parse(session.submissionStartedAt) === keyMs,
    )
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

/** 묶음 전체 구간. 키가 남은 첫 조각의 시작이라, 그 조각이 받지 않은 전날 응답에 있어도 시작을 안다. */
export function bundleSpan(bundle: readonly StudySessionSummary[]): ManualSpan {
  const spans = bundle.map(spanOf);
  const key = bundle[0]?.submissionStartedAt;
  const keyMs = key === undefined ? Number.POSITIVE_INFINITY : Date.parse(key);
  return {
    startMs: Math.min(keyMs, ...spans.map((span) => span.startMs)),
    endMs: Math.max(...spans.map((span) => span.endMs)),
  };
}

/**
 * 받은 조각 뒤에 묶음이 이어질 수 있는 날짜 키
 *
 * 자정에 나뉜 조각은 다음 날 조회에만 있어, 받은 마지막 조각이 자정에 딱 끝나면 그날 조회를 받기 전에는
 * 묶음 끝을 모른다. 그 끝으로 수정하면 기록이 줄어든다. 자정이 아닌 시각에 끝나면 null이다.
 */
export function bundleMayContinue(bundle: readonly StudySessionSummary[]): string | null {
  const endMs = Math.max(...bundle.map((piece) => Date.parse(piece.endedAt)));
  const key = kstDateKey(new Date(endMs));
  return kstDayStartMs(key) === endMs ? key : null;
}

export function manualBundles(sessions: readonly StudySessionSummary[]): StudySessionSummary[][] {
  const seen = new Set<number>();
  const bundles: StudySessionSummary[][] = [];
  for (const session of sessions) {
    if (!isManualSession(session) || seen.has(session.id)) {
      continue;
    }
    const bundle = bundleOf(sessions, session.id);
    for (const piece of bundle) {
      seen.add(piece.id);
    }
    bundles.push(bundle);
  }
  return bundles;
}

/** 수동 기록은 전체 구간 하나만 과목 구간으로 남아 첫 구간의 과목이 그 기록의 과목이다. */
export function subjectIdOf(session: StudySessionSummary | undefined): number | null {
  return session?.subjectSegments?.[0]?.subjectId ?? null;
}

export function subjectNameOf(
  subjectId: number | null,
  refs: ReadonlyMap<number, SubjectRef>,
): string {
  return subjectId === null
    ? MANUAL_RECORD_COPY.noSubject
    : (refs.get(subjectId)?.name ?? MANUAL_RECORD_COPY.noSubject);
}

function koreanClock(ms: number): { period: "오전" | "오후"; time: string } {
  const [hour = 0, minute = 0] = clockOf(ms).split(":").map(Number);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return {
    period: hour < 12 ? "오전" : "오후",
    time: minute === 0 ? `${hour12}시` : `${hour12}시 ${minute}분`,
  };
}

/** 스크린리더 문장. 화면에서는 측정 기록과 같은 색이라 수동 기록이라는 말을 앞에 둔다. */
export function readAloudLabel(input: { subjectName: string; span: ManualSpan }): string {
  const start = koreanClock(input.span.startMs);
  const end = koreanClock(input.span.endMs);
  const endText = end.period === start.period ? end.time : `${end.period} ${end.time}`;
  const length = formatDuration((input.span.endMs - input.span.startMs) / 1000);
  return `수동 기록, ${input.subjectName}, ${start.period} ${start.time}부터 ${endText}, ${length}`;
}

/**
 * 플래너 칸 탭의 결과. 칸 시작 시각이 어디에 속하는지로 정한다.
 * 지금이 속한 분의 칸은 기본 구간이 길이 0이 되므로 반응하지 않는다.
 */
export function cellTapTarget(
  cellStartMs: number,
  sessions: readonly StudySessionSummary[],
  nowMs: number,
): { kind: "add" } | { kind: "edit"; bundle: StudySessionSummary[] } | null {
  if (cellStartMs >= floorMinute(nowMs)) {
    return null;
  }
  // 겹치는 기록은 플래너가 시작이 늦은 것을 위에 그린다(같은 시작이면 뒤의 것). 보이는 블록을 고른다.
  let hit: StudySessionSummary | undefined;
  for (const session of sessions) {
    const span = spanOf(session);
    const covers = span.startMs <= cellStartMs && cellStartMs < span.endMs;
    if (covers && (hit === undefined || span.startMs >= spanOf(hit).startMs)) {
      hit = session;
    }
  }
  if (hit === undefined) {
    return { kind: "add" };
  }
  return isManualSession(hit) ? { kind: "edit", bundle: bundleOf(sessions, hit.id) } : null;
}
