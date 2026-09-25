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

/** 세션 바텀시트용 — 그 세션 하나만 칠한 하루 720칸. */
export function sessionTimetable(session: TimetableSession, dateKey: string): TimetableSlot[] {
  return dayTimetable([session], dateKey);
}

/** 과목 id → 이름·색. 지운 과목도 들어 있다(`deleted`). 응답에 `subjects`가 없으면 빈 맵. */
export function subjectRefMap(
  subjects: readonly SubjectRef[] | undefined,
): ReadonlyMap<number, SubjectRef> {
  return new Map((subjects ?? []).map((subject) => [subject.id, subject]));
}

export interface SubjectTotalRow {
  readonly subjectId: number;
  readonly studySec: number;
  readonly focusSec: number;
}

/**
 * 세션들의 과목별 총공부·순공 합 — 서버가 구간마다 계산해 준 값을 더한다(로컬 재계산 없음).
 * 순서는 그 과목의 첫 구간이 나타난 순이다.
 */
export function subjectTotalsOf(
  sessions: readonly { readonly subjectSegments?: readonly SubjectSegmentResponse[] }[],
): SubjectTotalRow[] {
  const rows = new Map<number, SubjectTotalRow>();
  for (const session of sessions) {
    for (const segment of session.subjectSegments ?? []) {
      const prev = rows.get(segment.subjectId);
      rows.set(segment.subjectId, {
        subjectId: segment.subjectId,
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
