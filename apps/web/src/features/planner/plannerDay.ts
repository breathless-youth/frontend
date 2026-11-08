import type {
  StatusEventPayload,
  StudySessionListResponse,
  StudySessionSummary,
  SubjectRef,
  SubjectResponse,
} from "@focusmakers/types";

import { isManualSession } from "@/features/manual-record/manualRecord";
import { addDaysToDateKey } from "@/features/records/recordsFormat";
import { subjectRefMap } from "@/features/records/recordsTimetable";
import { deviceTimeZone, localDateKey, localTimeOfDayMs, zonedTimeMs } from "@/lib/dateKey";

/**
 * 플래너의 하루 — 순수 함수.
 *
 * 플래너의 하루는 05:00부터 다음 날 05:00까지다(기기 시간대). 밤 11시~새벽 1시에 공부하면 전부 전날
 * 플래너에 이어서 보인다. 서버의 날짜는 자정 기준 그대로라, 앱이 일간 조회를 그 날짜와 다음 날짜
 * 두 번 받아 05:00~다음 날 05:00 구간만 남긴다. 완료한 할 일도 이틀치를 받아 완료 시각으로 가른다.
 * 그래서 새벽 0~5시에 공부한 날은 플래너의 순공과 기록 탭 달력 칸의 순공이 다를 수 있다.
 */

/** 플래너의 하루가 시작하는 시각(기기 시간대 시). */
export const PLANNER_DAY_START_HOUR = 5;

/** 아직 오지 않은 날짜의 조회를 대신하는 빈 응답 — 오늘 플래너의 "다음 날"과 미래 날짜의 플래너가 여기에 해당한다. */
export const EMPTY_STATS: StudySessionListResponse = {
  sessions: [],
  sessionCount: 0,
  totalStudySec: 0,
  totalFocusSec: 0,
  longestFocusSec: 0,
  focusRate: 0,
  totalEventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
  studiedDatesInMonth: [],
  subjects: [],
};

function plannerDayStartMs(dateKey: string, timeZone: string): number {
  return zonedTimeMs(dateKey, PLANNER_DAY_START_HOUR * 60, timeZone);
}

/**
 * 플래너 날짜 키의 하루 구간 `[start, end)` — 그날 05:00부터 다음 날 05:00.
 *
 * 서머타임 전환이 든 날은 23시간이나 25시간이라 끝은 다음 날짜의 05:00으로 구한다.
 */
export function plannerDayWindow(
  dateKey: string,
  timeZone: string = deviceTimeZone(),
): { startMs: number; endMs: number } {
  return {
    startMs: plannerDayStartMs(dateKey, timeZone),
    endMs: plannerDayStartMs(addDaysToDateKey(dateKey, 1), timeZone),
  };
}

/**
 * 어떤 시각이 속한 플래너 날짜
 *
 * 새벽 0~5시는 전날 플래너에 든다.
 */
export function plannerDateKeyOf(at: Date, timeZone: string = deviceTimeZone()): string {
  const dateKey = localDateKey(at, timeZone);
  return at.getTime() < plannerDayStartMs(dateKey, timeZone)
    ? addDaysToDateKey(dateKey, -1)
    : dateKey;
}

export function plannerCurrentTime(
  dateKey: string,
  nowMs: number,
  timeZone: string = deviceTimeZone(),
): { hour: number; fraction: number; label: string } | null {
  if (plannerDateKeyOf(new Date(nowMs), timeZone) !== dateKey) return null;
  const timeMs = localTimeOfDayMs(nowMs, timeZone);
  const hour = Math.floor(timeMs / 3_600_000);
  const minute = Math.floor((timeMs % 3_600_000) / 60_000);
  return {
    hour,
    fraction: (timeMs % 3_600_000) / 3_600_000,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

/** 타임테이블이 한 구간을 무엇으로 칠할지. */
export type PlannerPaintKind =
  /** 과목을 고르고 공부한 세션 구간 */
  | { kind: "subject"; subjectId: number }
  /** 과목 없이 공부한 세션 구간 */
  | { kind: "focus" };

/** `manual`은 수동 기록에서 온 구간이다. 칠하는 색은 측정과 같고, 칸 탭이 수정 대상을 고를 때만 쓴다. */
export type PlannerPaint = PlannerPaintKind & {
  startMs: number;
  endMs: number;
  manual: boolean;
  edited?: boolean;
};

export interface PlannerSubjectRow {
  subjectId: number;
  focusSec: number;
}

/** 그날 완료한 할 일 — 세션에서 체크했든 세션 없이 체크했든 완료 시각이 이 하루에 든 것. */
export interface PlannerCompletedTask {
  id: number;
  name: string;
  subjectId: number;
  doneAtMs: number;
}

export interface PlannerDay {
  dateKey: string;
  timeZone?: string;
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
  /** 완료 시각이 이 하루에 든 할 일 — 완료 시각 순. */
  completedTasks: PlannerCompletedTask[];
  /** 그 날짜와 다음 날짜의 원본 조각(시작 순). 수동 기록 시트의 기본값·겹침·묶음 계산에 쓴다. */
  sessions: StudySessionSummary[];
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
 * 세션 전체를 과목별 칠 구간으로 나누기
 *
 * 비집중과 일시정지도 같은 과목으로 칠하고 순공 계산은 별도로 유지한다.
 */
function paintSession(
  span: Interval,
  session: StudySessionSummary,
  canonical: (subjectId: number) => number,
  manual: boolean,
): PlannerPaint[] {
  const segments = (session.subjectSegments ?? []).flatMap((segment) => {
    const interval = clip(segment.startedAt, segment.endedAt, span);
    return interval === null ? [] : [{ ...interval, subjectId: canonical(segment.subjectId) }];
  });

  const cuts = new Set<number>([span.startMs, span.endMs]);
  for (const interval of segments) {
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
    const kind: PlannerPaintKind =
      segment !== undefined ? { kind: "subject", subjectId: segment.subjectId } : { kind: "focus" };
    const last = paints[paints.length - 1];
    const sameAsLast =
      last !== undefined &&
      last.endMs === startMs &&
      last.kind === kind.kind &&
      (last.kind !== "subject" || (kind.kind === "subject" && last.subjectId === kind.subjectId));
    if (sameAsLast) {
      last.endMs = endMs;
    } else {
      paints.push({ ...kind, startMs, endMs, manual });
    }
  }
  return paints;
}

/**
 * 일간 조회 이틀치(그 날짜, 다음 날짜)로 플래너의 하루를 조립한다. 완료한 할 일도 같은 이틀의
 * 응답(`subjects[].tasks`)에서 모아 완료 시각으로 가른다.
 *
 * 구간 안에 온전히 든 세션·과목 구간은 서버가 준 순공·총 공부를 그대로 쓴다. 05:00을 걸친 것만
 * 앱이 이벤트로 다시 나눈다(총 공부 = 길이 − 일시정지 겹침, 순공 = 길이 − 모든 이벤트 겹침).
 */
export function assemblePlannerDay(
  dateKey: string,
  dayStats: StudySessionListResponse,
  nextDayStats: StudySessionListResponse,
  timeZone: string = deviceTimeZone(),
): PlannerDay {
  const window = plannerDayWindow(dateKey, timeZone);
  const rawSubjects = subjectRefMap([
    ...(dayStats.subjects ?? []),
    ...(nextDayStats.subjects ?? []),
  ]);
  // 같은 할 일이 이틀 응답에 모두 실릴 수 있어 id로 한 번만 센다(미완료이거나 다음 날 새벽에 완료한 것).
  // 과목에 `tasks`가 없는 서버의 응답이면 완료한 할 일 없이 그린다.
  const dayTasks = new Map(
    [...(dayStats.subjects ?? []), ...(nextDayStats.subjects ?? [])].flatMap((subject) =>
      (subject.tasks ?? []).map((task) => [task.id, { ...task, subjectId: subject.id }] as const),
    ),
  );
  const canonical = (subjectId: number) => rawSubjects.get(subjectId)?.id ?? subjectId;

  const sessions = [...dayStats.sessions, ...nextDayStats.sessions].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
  );

  let focusMs = 0;
  let studyMs = 0;
  const paints: PlannerPaint[] = [];
  const subjectFocusMs = new Map<number, number>();
  let previousSession: StudySessionSummary | undefined;

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

    const sessionPaints = paintSession(span, session, canonical, isManualSession(session));
    const previousPaint = paints.at(-1);
    const firstPaint = sessionPaints[0];
    const sameSubmission =
      session.submissionStartedAt !== undefined &&
      previousSession?.submissionStartedAt !== undefined &&
      Date.parse(session.submissionStartedAt) === Date.parse(previousSession.submissionStartedAt);
    // 서버가 자정에 나눈 같은 저장 묶음은 색과 시간이 이어지면 시작선도 이어 준다.
    if (
      sameSubmission &&
      previousPaint !== undefined &&
      firstPaint !== undefined &&
      previousPaint.endMs === firstPaint.startMs &&
      previousPaint.manual === firstPaint.manual &&
      previousPaint.kind === firstPaint.kind &&
      (previousPaint.kind !== "subject" ||
        (firstPaint.kind === "subject" && previousPaint.subjectId === firstPaint.subjectId))
    ) {
      previousPaint.endMs = firstPaint.endMs;
      sessionPaints.shift();
    }
    paints.push(...sessionPaints);
    previousSession = session;
  }

  const subjectRows = [...subjectFocusMs].map(([subjectId, ms]) => ({
    subjectId,
    focusSec: Math.floor(ms / 1000),
  }));
  const focusSec = Math.floor(focusMs / 1000);
  const assignedSec = subjectRows.reduce((sum, row) => sum + row.focusSec, 0);

  return {
    dateKey,
    timeZone,
    startMs: window.startMs,
    endMs: window.endMs,
    focusSec,
    studySec: Math.floor(studyMs / 1000),
    paints,
    subjectRows,
    unassignedFocusSec: Math.max(0, focusSec - assignedSec),
    // 지난 날에는 그날 완료한 것만 보여 준다 — 미완료와 그날 뒤에 완료한 것은 버린다.
    completedTasks: [...dayTasks.values()]
      .flatMap((task) => {
        const doneAtMs = task.doneAt === null ? Number.NaN : Date.parse(task.doneAt);
        return doneAtMs >= window.startMs && doneAtMs < window.endMs
          ? [
              {
                id: task.id,
                name: task.name,
                subjectId: canonical(task.subjectId),
                doneAtMs,
              },
            ]
          : [];
      })
      .sort((a, b) => a.doneAtMs - b.doneAtMs),
    sessions,
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
  manual: boolean;
  edited?: boolean;
  /** 실제 블록 시작에만 진한 시작선을 그린다. */
  startsBlock: boolean;
}

/**
 * 하루 144칸에 표시할 세션 조각
 *
 * 칸 안을 실제 시작·종료 시각대로 나누고 블록 시작 위치를 보존한다.
 *
 * 칸은 기기 시간대의 벽시계 시각으로 고른다. 서머타임이 시작하는 날은 없는 2시대 칸이 비고,
 * 끝나는 날은 두 번 오는 1시대가 같은 칸에 겹쳐 칠해진다.
 * 서머타임 전환은 정시에 일어나 칸 경계와 겹치므로 한 칸 안에서는 벽시계와 실제 시각이 같이 흐른다.
 */
export function plannerCellFills(
  day: Pick<PlannerDay, "paints" | "timeZone">,
): PlannerCellFill[][] {
  const cellMs = PLANNER_CELL_MINUTES * 60_000;
  const cells: PlannerCellFill[][] = Array.from({ length: 24 * PLANNER_CELLS_PER_ROW }, () => []);
  const firstCellOfDay = (PLANNER_DAY_START_HOUR * 60) / PLANNER_CELL_MINUTES;
  for (const paint of day.paints) {
    const fill: PlannerPaintKind =
      paint.kind === "subject"
        ? { kind: "subject", subjectId: paint.subjectId }
        : { kind: paint.kind };
    let from = paint.startMs;
    while (from < paint.endMs) {
      const timeOfDay = localTimeOfDayMs(from, day.timeZone);
      const offset = timeOfDay % cellMs;
      const to = Math.min(paint.endMs, from - offset + cellMs);
      const index = (Math.floor(timeOfDay / cellMs) - firstCellOfDay + cells.length) % cells.length;
      cells[index]!.push({
        left: offset / cellMs,
        width: (to - from) / cellMs,
        paint: fill,
        manual: paint.manual,
        ...(paint.edited ? { edited: true } : {}),
        startsBlock: from === paint.startMs,
      });
      from = to;
    }
  }
  return cells;
}

/**
 * 칸을 눌렀을 때의 시작 시각
 *
 * 칸 번호를 그 플래너 날짜의 벽시계 시각으로 바꾼다.
 * 없는 시각의 칸은 수동 기록 입력과 같이 건너뛴 만큼 늦은 시각이고, 두 번 오는 시각은 먼저 오는 쪽이다.
 */
export function plannerCellStartMs(
  dateKey: string,
  index: number,
  timeZone: string = deviceTimeZone(),
): number {
  return zonedTimeMs(dateKey, PLANNER_DAY_START_HOUR * 60 + index * PLANNER_CELL_MINUTES, timeZone);
}

/**
 * 일간 조회 응답에서 과목 목록 API와 같은 모양의 목록을 꺼낸다 — 살아있는 과목(응답 순서 그대로)과 그 날짜의
 * 지우지 않은 할 일. 오늘 날짜의 응답이면 과목 목록 API가 주는 것(미완료 + 오늘 완료)과 같다.
 * 과목마다 `tasks`가 실려 오지 않는 서버의 응답이거나 과목이 하나도 없으면 `null` — 호출부가 과목 목록 API로 대신한다.
 */
export function liveSubjectsOf(stats: StudySessionListResponse): SubjectResponse[] | null {
  const subjects = stats.subjects ?? [];
  if (subjects.length === 0 || subjects.some((subject) => !Array.isArray(subject.tasks))) {
    return null;
  }
  return subjects
    .filter((subject) => !subject.deleted)
    .map((subject) => ({
      id: subject.id,
      name: subject.name,
      colorIndex: subject.colorIndex,
      // 누적 시간은 세션 과목 시트만 쓴다 — 플래너는 그날의 시간을 기록에서 따로 센다.
      studySec: 0,
      focusSec: 0,
      tasks: (subject.tasks ?? [])
        .filter((task) => !task.deleted)
        .map((task) => ({ id: task.id, name: task.name, doneAt: task.doneAt })),
    }));
}
