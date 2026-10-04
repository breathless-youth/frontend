import type {
  CompletedTaskResponse,
  StatusEventPayload,
  StudySessionListResponse,
  StudySessionSummary,
  SubjectRef,
} from "@focusmakers/types";

import { addDaysToDateKey, kstDateKey } from "@/features/records/recordsFormat";
import { kstDayStartMs, subjectRefMap } from "@/features/records/recordsTimetable";

/**
 * 플래너의 하루 — 순수 함수.
 *
 * 플래너의 하루는 05:00부터 다음 날 05:00까지다(KST). 밤 11시~새벽 1시에 공부하면 전부 전날
 * 플래너에 이어서 보인다. **서버는 바꾸지 않는다** — 세션 분할과 날짜 귀속은 자정 기준 그대로라,
 * 앱이 일간 조회를 그 날짜와 다음 날짜 두 번 받아 05:00~다음 날 05:00 구간만 남긴다.
 * 그래서 새벽 0~5시에 공부한 날은 플래너의 순공과 기록 탭 달력 칸의 순공이 다를 수 있다.
 */

/** 플래너의 하루가 시작하는 시각(KST 시). */
export const PLANNER_DAY_START_HOUR = 5;

const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;

/** 플래너 날짜 키의 하루 구간 `[start, end)` — 그날 05:00부터 다음 날 05:00. */
export function plannerDayWindow(dateKey: string): { startMs: number; endMs: number } {
  const startMs = kstDayStartMs(dateKey) + PLANNER_DAY_START_HOUR * HOUR_MS;
  return { startMs, endMs: startMs + DAY_MS };
}

/**
 * 어떤 시각이 속한 플래너 날짜 — 새벽 0~5시는 전날 플래너에 든다.
 * 플래너를 열 때의 "오늘"은 이 값이 아니라 달력 날짜(자정 기준)다. 05시 기준은 한 장에 담는 구간에만 쓴다.
 */
export function plannerDateKeyOf(at: Date): string {
  return kstDateKey(new Date(at.getTime() - PLANNER_DAY_START_HOUR * HOUR_MS));
}

/** 타임테이블이 한 구간을 무엇으로 칠할지. */
export type PlannerPaintKind =
  /** 과목을 고르고 공부한 순공 — 과목 색 */
  | { kind: "subject"; subjectId: number }
  /** 과목 없이 공부한 순공 — 기본 집중색 */
  | { kind: "focus" }
  /** 순공이 아닌 시간(자동 멈춤 + 일시정지) — 휴식색 */
  | { kind: "rest" };

export type PlannerPaint = PlannerPaintKind & { startMs: number; endMs: number };

export interface PlannerSubjectRow {
  subjectId: number;
  focusSec: number;
}

export interface PlannerDay {
  dateKey: string;
  startMs: number;
  endMs: number;
  focusSec: number;
  studySec: number;
  /** 시작 시각 순으로 겹치지 않는 칠 구간. 세션이 없는 시간은 들어 있지 않다. */
  paints: PlannerPaint[];
  /** 과목별 순공 — 그 과목의 첫 구간이 나타난 순. 이름이 같은 과목은 대표 하나로 합친다. */
  subjectRows: PlannerSubjectRow[];
  /** 과목을 고르지 않고 공부한 순공(초). */
  unassignedFocusSec: number;
  /** 그날 세션에서 완료한 할 일 — id 중복 없이. */
  completedTasks: CompletedTaskResponse[];
  /** 과목 id → 이름·색(이름이 같으면 대표 과목). */
  subjects: ReadonlyMap<number, SubjectRef>;
}

interface Interval {
  startMs: number;
  endMs: number;
}

function clip(startedAt: string, endedAt: string, window: Interval): Interval | null {
  const startMs = Math.max(window.startMs, Date.parse(startedAt));
  const endMs = Math.min(window.endMs, Date.parse(endedAt));
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
    ? { startMs, endMs }
    : null;
}

function overlapMs(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));
}

function eventOverlapMs(
  span: Interval,
  events: readonly StatusEventPayload[],
  only?: StatusEventPayload["status"],
): number {
  let total = 0;
  for (const event of events) {
    if (only !== undefined && event.status !== only) {
      continue;
    }
    total += overlapMs(span, {
      startMs: Date.parse(event.startedAt),
      endMs: Date.parse(event.endedAt),
    });
  }
  return total;
}

/**
 * 세션 한 조각을 순서대로 칠 구간으로 자른다 — 휴식 > 과목 > 과목 없는 순공 순으로 덮는다.
 * 과목 구간 안이라도 순공이 아닌 시간은 과목 색으로 칠하지 않는다.
 */
function paintSession(
  span: Interval,
  session: StudySessionSummary,
  canonical: (subjectId: number) => number,
): PlannerPaint[] {
  const events = (session.events ?? [])
    .map((event) => clip(event.startedAt, event.endedAt, span))
    .filter((interval): interval is Interval => interval !== null);
  const segments = (session.subjectSegments ?? []).flatMap((segment) => {
    const interval = clip(segment.startedAt, segment.endedAt, span);
    return interval === null ? [] : [{ ...interval, subjectId: canonical(segment.subjectId) }];
  });

  const cuts = new Set<number>([span.startMs, span.endMs]);
  for (const interval of [...events, ...segments]) {
    cuts.add(interval.startMs);
    cuts.add(interval.endMs);
  }
  const points = [...cuts].sort((a, b) => a - b);

  const paints: PlannerPaint[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const startMs = points[index]!;
    const endMs = points[index + 1]!;
    const middle = (startMs + endMs) / 2;
    const covers = (interval: Interval) => middle >= interval.startMs && middle < interval.endMs;
    const segment = segments.find(covers);
    const kind: PlannerPaintKind = events.some(covers)
      ? { kind: "rest" }
      : segment !== undefined
        ? { kind: "subject", subjectId: segment.subjectId }
        : { kind: "focus" };
    const last = paints[paints.length - 1];
    const sameAsLast =
      last !== undefined &&
      last.endMs === startMs &&
      last.kind === kind.kind &&
      (last.kind !== "subject" || (kind.kind === "subject" && last.subjectId === kind.subjectId));
    if (sameAsLast) {
      last.endMs = endMs;
    } else {
      paints.push({ ...kind, startMs, endMs });
    }
  }
  return paints;
}

/**
 * 일간 조회 이틀치(그 날짜, 다음 날짜)로 플래너의 하루를 조립한다.
 *
 * 구간 안에 온전히 든 세션·과목 구간은 서버가 준 순공·총 공부를 그대로 쓴다. 05:00을 걸친 것만
 * 앱이 이벤트로 다시 나눈다(총 공부 = 길이 − 일시정지 겹침, 순공 = 길이 − 모든 이벤트 겹침).
 */
export function assemblePlannerDay(
  dateKey: string,
  dayStats: StudySessionListResponse,
  nextDayStats: StudySessionListResponse,
): PlannerDay {
  const window = plannerDayWindow(dateKey);
  const rawSubjects = subjectRefMap([
    ...(dayStats.subjects ?? []),
    ...(nextDayStats.subjects ?? []),
  ]);
  const canonical = (subjectId: number) => rawSubjects.get(subjectId)?.id ?? subjectId;

  const sessions = [...dayStats.sessions, ...nextDayStats.sessions].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
  );

  let focusMs = 0;
  let studyMs = 0;
  const paints: PlannerPaint[] = [];
  const subjectFocusMs = new Map<number, number>();
  const completedTasks = new Map<number, CompletedTaskResponse>();

  for (const session of sessions) {
    const span = clip(session.startedAt, session.endedAt, window);
    if (span === null) {
      continue;
    }
    const events = session.events ?? [];
    const whole =
      span.startMs === Date.parse(session.startedAt) && span.endMs === Date.parse(session.endedAt);
    if (whole) {
      focusMs += session.focusSec * 1000;
      studyMs += session.studySec * 1000;
    } else {
      const spanMs = span.endMs - span.startMs;
      focusMs += Math.max(0, spanMs - eventOverlapMs(span, events));
      studyMs += Math.max(0, spanMs - eventOverlapMs(span, events, "PAUSE"));
    }

    for (const segment of session.subjectSegments ?? []) {
      const segmentSpan = clip(segment.startedAt, segment.endedAt, span);
      if (segmentSpan === null) {
        continue;
      }
      const segmentWhole =
        segmentSpan.startMs === Date.parse(segment.startedAt) &&
        segmentSpan.endMs === Date.parse(segment.endedAt);
      const ms = segmentWhole
        ? segment.focusSec * 1000
        : Math.max(
            0,
            segmentSpan.endMs - segmentSpan.startMs - eventOverlapMs(segmentSpan, events),
          );
      const id = canonical(segment.subjectId);
      subjectFocusMs.set(id, (subjectFocusMs.get(id) ?? 0) + ms);
    }

    // 완료 할 일은 시각 없이 세션 조각에 붙어 온다 — 조각이 이 하루에서 시작했으면 이날 것으로 본다.
    // ponytail: 05:00을 걸친 조각의 완료 할 일은 앞쪽 날에만 보인다. 완료 시각이 내려오면 그 시각으로 가른다.
    if (Date.parse(session.startedAt) >= window.startMs) {
      for (const task of session.completedTasks ?? []) {
        completedTasks.set(task.id, { ...task, subjectId: canonical(task.subjectId) });
      }
    }

    paints.push(...paintSession(span, session, canonical));
  }

  const subjectRows = [...subjectFocusMs].map(([subjectId, ms]) => ({
    subjectId,
    focusSec: Math.floor(ms / 1000),
  }));
  const focusSec = Math.floor(focusMs / 1000);
  const assignedSec = subjectRows.reduce((sum, row) => sum + row.focusSec, 0);

  return {
    dateKey,
    startMs: window.startMs,
    endMs: window.endMs,
    focusSec,
    studySec: Math.floor(studyMs / 1000),
    paints,
    subjectRows,
    unassignedFocusSec: Math.max(0, focusSec - assignedSec),
    completedTasks: [...completedTasks.values()],
    subjects: rawSubjects,
  };
}

/** 타임테이블 한 행의 시(0~23) — 5시에서 시작해 다음 날 4시에서 끝난다. */
export function plannerHours(): number[] {
  return Array.from({ length: 24 }, (_, index) => (PLANNER_DAY_START_HOUR + index) % 24);
}

/** 타임테이블 한 칸의 길이(분). */
export const PLANNER_CELL_MINUTES = 10;
export const PLANNER_CELLS_PER_ROW = 60 / PLANNER_CELL_MINUTES;

export interface PlannerCellFill {
  /** 칸 안에서의 위치·폭(0~1) — 칸 단위로 반올림하지 않고 실제 시각대로 나눈다. */
  left: number;
  width: number;
  paint: PlannerPaintKind;
}

/**
 * 하루 144칸(24행 × 6칸) 각각이 칠할 조각. 2분 쉬었다고 10분 칸 전체가 휴식색이 되지 않게
 * 칸 안을 실제 시작·종료 시각대로 나눈다.
 */
export function plannerCellFills(day: Pick<PlannerDay, "startMs" | "paints">): PlannerCellFill[][] {
  const cellMs = PLANNER_CELL_MINUTES * 60_000;
  const cells: PlannerCellFill[][] = Array.from({ length: 24 * PLANNER_CELLS_PER_ROW }, () => []);
  for (const paint of day.paints) {
    const first = Math.max(0, Math.floor((paint.startMs - day.startMs) / cellMs));
    const last = Math.min(cells.length - 1, Math.floor((paint.endMs - 1 - day.startMs) / cellMs));
    for (let index = first; index <= last; index += 1) {
      const cellStart = day.startMs + index * cellMs;
      const from = Math.max(paint.startMs, cellStart);
      const to = Math.min(paint.endMs, cellStart + cellMs);
      if (to <= from) {
        continue;
      }
      const fill: PlannerPaintKind =
        paint.kind === "subject"
          ? { kind: "subject", subjectId: paint.subjectId }
          : { kind: paint.kind };
      cells[index]!.push({
        left: (from - cellStart) / cellMs,
        width: (to - from) / cellMs,
        paint: fill,
      });
    }
  }
  return cells;
}

/** 플래너 날짜를 하루 옮긴다. 오늘(플래너 기준)보다 뒤로는 가지 않는다. */
export function shiftPlannerDate(dateKey: string, delta: -1 | 1, todayKey: string): string {
  const next = addDaysToDateKey(dateKey, delta);
  return next > todayKey ? dateKey : next;
}
