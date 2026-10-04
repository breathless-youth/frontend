import type {
  CompletedTaskResponse,
  StatusEventPayload,
  StudyEventStatus,
  SubjectRef,
  SubjectSegmentResponse,
} from "@focusmakers/types";

/**
 * 기록 탭 v2의 24시간 타임테이블·과목별 합계·완료 할 일 — 순수 함수.
 *
 * 일간 조회(`GET /api/stats?date=`) 한 번에 실려 오는 세션별 `events`·`subjectSegments`·`completedTasks`와
 * 응답 최상위 `subjects`를 화면이 바로 그릴 모양으로 바꾼다. 화면 컴포넌트는 후속 작업이 만든다.
 */

/** 타임테이블 한 칸의 길이(분) — 프로토타입의 2분 720칸. */
export const SLOT_MINUTES = 2;
export const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;

export type TimetableSlot =
  /** 그 시각에 세션이 없다 */
  | { kind: "empty" }
  /** 세션 안이지만 과목을 고르지 않은 시간 — 기본 집중색 */
  | { kind: "focus" }
  /** 비공부 이벤트 구간 — 휴식(회색) */
  | { kind: "rest"; status: StudyEventStatus }
  /** 과목을 고른 채 공부한 구간 — 과목 색 */
  | { kind: "subject"; subjectId: number };

/** 타임테이블을 그릴 세션 조각 — 일간 목록의 `sessions[]`와 상세 응답 둘 다 이 모양을 만족한다. */
export interface TimetableSession {
  readonly startedAt: string;
  readonly endedAt: string;
  readonly events?: readonly StatusEventPayload[];
  readonly subjectSegments?: readonly SubjectSegmentResponse[];
}

/** KST 날짜 키(`YYYY-MM-DD`)의 자정 epoch ms. */
export function kstDayStartMs(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00+09:00`);
}

function covers(startedAt: string, endedAt: string, ms: number): boolean {
  return ms >= Date.parse(startedAt) && ms < Date.parse(endedAt);
}

/** 한 시각의 칸 종류 — 휴식 > 과목 > 집중 순으로 덮는다(프로토타입과 같다). */
function slotAt(sessions: readonly TimetableSession[], ms: number): TimetableSlot {
  for (const session of sessions) {
    if (!covers(session.startedAt, session.endedAt, ms)) {
      continue;
    }
    const rest = (session.events ?? []).find((event) => covers(event.startedAt, event.endedAt, ms));
    if (rest !== undefined) {
      return { kind: "rest", status: rest.status };
    }
    const segment = (session.subjectSegments ?? []).find((item) =>
      covers(item.startedAt, item.endedAt, ms),
    );
    if (segment !== undefined) {
      return { kind: "subject", subjectId: segment.subjectId };
    }
    return { kind: "focus" };
  }
  return { kind: "empty" };
}

/**
 * 하루 720칸. 각 칸은 그 칸의 가운데 시각을 덮는 세션·이벤트·구간으로 종류를 정한다 — 2분보다 짧은
 * 구간은 칸 하나에 못 미쳐 사라질 수 있는데, 화면 해상도가 2분이라 그게 맞다.
 */
export function dayTimetable(
  sessions: readonly TimetableSession[],
  dateKey: string,
): TimetableSlot[] {
  const dayStartMs = kstDayStartMs(dateKey);
  return Array.from({ length: SLOTS_PER_DAY }, (_, index) =>
    slotAt(sessions, dayStartMs + (index + 0.5) * SLOT_MINUTES * 60_000),
  );
}

/**
 * 과목 id → 이름·색. 지운 과목도 들어 있다(`deleted`). 응답에 `subjects`가 없으면 빈 맵.
 *
 * 이름이 같은 과목은 id가 달라도 대표 하나로 모은다 — 지웠다 다시 만들어 id가 갈린 과목이 화면에서
 * 한 줄·한 색으로 보이게 한다. 대표는 살아있는 과목, 없으면 응답에서 먼저 나온 과목이다.
 */
export function subjectRefMap(
  subjects: readonly SubjectRef[] | undefined,
): ReadonlyMap<number, SubjectRef> {
  const byName = new Map<string, SubjectRef>();
  for (const subject of subjects ?? []) {
    const chosen = byName.get(subject.name);
    if (chosen === undefined || (chosen.deleted && !subject.deleted)) {
      byName.set(subject.name, subject);
    }
  }
  return new Map(
    (subjects ?? []).map((subject) => [subject.id, byName.get(subject.name) ?? subject]),
  );
}

export interface SubjectTotalRow {
  readonly subjectId: number;
  readonly studySec: number;
  readonly focusSec: number;
}

/**
 * 세션들의 과목별 총공부·순공 합 — 서버가 구간마다 계산해 준 값을 더한다(로컬 재계산 없음).
 * 순서는 그 과목의 첫 구간이 나타난 순이다. 이름이 같은 과목은 `subjects`(`subjectRefMap`의 결과)의
 * 대표 id 한 줄로 합친다.
 */
export function subjectTotalsOf(
  sessions: readonly { readonly subjectSegments?: readonly SubjectSegmentResponse[] }[],
  subjects: ReadonlyMap<number, SubjectRef>,
): SubjectTotalRow[] {
  const rows = new Map<number, SubjectTotalRow>();
  for (const session of sessions) {
    for (const segment of session.subjectSegments ?? []) {
      const subjectId = subjects.get(segment.subjectId)?.id ?? segment.subjectId;
      const prev = rows.get(subjectId);
      rows.set(subjectId, {
        subjectId,
        studySec: (prev?.studySec ?? 0) + segment.studySec,
        focusSec: (prev?.focusSec ?? 0) + segment.focusSec,
      });
    }
  }
  return [...rows.values()];
}

/** 세션들이 완료한 할 일 — id 중복 없이 세션 순서대로. 지운 할 일도 남는다(`deleted`). */
export function completedTasksOf(
  sessions: readonly { readonly completedTasks?: readonly CompletedTaskResponse[] }[],
): CompletedTaskResponse[] {
  const seen = new Set<number>();
  const tasks: CompletedTaskResponse[] = [];
  for (const session of sessions) {
    for (const task of session.completedTasks ?? []) {
      if (!seen.has(task.id)) {
        seen.add(task.id);
        tasks.push(task);
      }
    }
  }
  return tasks;
}

/**
 * 과목 색 토큰 참조. colorIndex 0~19를 20색 팔레트에 순환 인덱싱한다(음수·초과 방어).
 * `.theme-soft-blue` 스코프의 원천 변수(`--subject-N`)를 직접 참조한다 — `@theme inline`은
 * 값을 유틸리티에 인라인만 하고 `--color-subject-N`을 CSS 변수로 방출하지 않아, 인라인
 * style에서 `var(--color-subject-N)`을 쓰면 미정의로 비어 버린다.
 */
export function subjectColorVar(colorIndex: number): string {
  const i = ((Math.trunc(colorIndex) % 20) + 20) % 20;
  return `var(--subject-${i})`;
}

/** 10분 묶음 우선순위 — 한 칸이 여러 종류를 걸치면 눈에 띄어야 할 것을 남긴다. */
function slotRank(slot: TimetableSlot): number {
  switch (slot.kind) {
    case "rest":
      return 3;
    case "subject":
      return 2;
    case "focus":
      return 1;
    default:
      return 0;
  }
}

/**
 * 720칸(2분)을 시안의 10분 칸으로 묶는다. 한 묶음(기본 5칸)에서 우선순위가 가장 높은
 * 종류를 대표로 남긴다(휴식 > 과목 > 집중 > 빈). 과목이 대표면 그 묶음에서 가장 먼저 나온
 * 과목 id를 쓴다 — 한 칸 안 과목 전환은 10분 해상도에서 하나로 보인다.
 */
export function condenseTimetable(slots: readonly TimetableSlot[]): TimetableSlot[] {
  const perCell = 5; // 10분(2분 5칸) — 시안 해상도. 고정이라 0 이하 진입로가 없다.
  const out: TimetableSlot[] = [];
  for (let start = 0; start < slots.length; start += perCell) {
    let best = slots[start];
    for (let j = start + 1; j < start + perCell && j < slots.length; j += 1) {
      if (slotRank(slots[j]) > slotRank(best)) {
        best = slots[j];
      }
    }
    out.push(best);
  }
  return out;
}

/**
 * 휴식(초) — 세션 안에서 순공이 아닌 모든 시간. 자동 멈춤과 일시정지를 합친다.
 * 그래서 `순공 + 휴식 = 세션 시각 범위의 길이`다(총 공부에서 순공을 빼면 일시정지가 빠진다).
 */
export function sessionRestSec(session: {
  startedAt: string;
  endedAt: string;
  focusSec: number;
}): number {
  const spanSec = Math.floor((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 1000);
  return Number.isFinite(spanSec) ? Math.max(0, spanSec - session.focusSec) : 0;
}

/** 세션들의 휴식 합(초). */
export function totalRestSec(
  sessions: readonly { startedAt: string; endedAt: string; focusSec: number }[],
): number {
  return sessions.reduce((sum, session) => sum + sessionRestSec(session), 0);
}

export interface MiniTimelinePiece {
  /** 순공 · 자동 멈춤 · 일시정지 — 공부 결과 화면의 타임라인과 같은 구분이다. */
  kind: "focus" | "distract" | "pause";
  /** 세션 시각 범위에 대한 비율(0~1). 조각들의 합은 1이다. */
  ratio: number;
}

/**
 * 세션 행의 미니 타임라인 — 세션 시각 범위를 순공과 이벤트 조각으로 순서대로 자른다.
 * 공부 결과 화면의 타임라인과 같은 데이터(세션의 `events`)를 쓴다.
 */
export function miniTimelinePieces(session: TimetableSession): MiniTimelinePiece[] {
  const startMs = Date.parse(session.startedAt);
  const endMs = Date.parse(session.endedAt);
  const spanMs = endMs - startMs;
  if (!Number.isFinite(spanMs) || spanMs <= 0) {
    return [];
  }
  const pieces: MiniTimelinePiece[] = [];
  const push = (kind: MiniTimelinePiece["kind"], fromMs: number, toMs: number) => {
    if (toMs > fromMs) {
      pieces.push({ kind, ratio: (toMs - fromMs) / spanMs });
    }
  };
  let cursor = startMs;
  const events = [...(session.events ?? [])].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
  );
  for (const event of events) {
    // 범위 밖이나 겹친 이벤트가 와도 막대가 깨지지 않게 세션 안으로 자르고 커서 뒤로는 가지 않는다.
    const eventStart = Math.min(endMs, Math.max(cursor, Date.parse(event.startedAt)));
    const eventEnd = Math.min(endMs, Math.max(cursor, Date.parse(event.endedAt)));
    if (Number.isNaN(eventStart) || Number.isNaN(eventEnd)) {
      continue;
    }
    push("focus", cursor, eventStart);
    push(event.status === "PAUSE" ? "pause" : "distract", eventStart, eventEnd);
    cursor = Math.max(cursor, eventEnd);
  }
  push("focus", cursor, endMs);
  return pieces;
}
