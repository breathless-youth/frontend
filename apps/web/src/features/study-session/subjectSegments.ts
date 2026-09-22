import type { StatusEventPayload, SubjectSegmentPayload } from "@focusmakers/types";

/**
 * 과목 구간 파생 — 순수 함수.
 *
 * 시간을 재지 않는다. 과목을 고른 시각과 바꾼 시각만 기록해 `[startedAt, endedAt)` 구간으로 보내고,
 * 과목별 총공부·순공은 서버가 비공부 이벤트와 겹쳐 계산한다 — 이벤트가 시각만 보내고 길이는 서버가
 * 계산하는 것과 같은 원칙이다. 화면이 지금 보여줄 값은 `deriveSubjectTotals`가 같은 규칙을 로컬
 * 이벤트로 흉내 낸다.
 *
 * 선택 없이 흐른 시간은 어느 구간에도 들지 않는다(과목 없는 시간 — 스펙 §4).
 */

/** 지금 구간이 열려 있는 과목의 id. 선택이 없으면 `null`이다. */
export type SubjectSelection = number;

export interface SubjectSegmentTracker {
  /** 닫힌 구간 — 시작 순. */
  readonly closed: readonly SubjectSegmentPayload[];
  /** 지금 열린 구간 — 고른 과목과 고른 시각(epoch ms). */
  readonly current: {
    readonly subjectId: SubjectSelection;
    readonly startedAtMs: number;
  } | null;
}

function byStart(a: SubjectSegmentPayload, b: SubjectSegmentPayload): number {
  return Date.parse(a.startedAt) - Date.parse(b.startedAt);
}

/**
 * 시작 상태. 복원이면 서버가 준 구간을 시작 순으로 물려받고 마지막 구간의 과목을 `resumeAtMs`부터
 * 다시 연다 — 복구 응답이 시작 오름차순이라 마지막 원소가 앱이 죽기 직전의 선택이다.
 * 죽어 있던 동안은 타임라인이 일시정지(BACKGROUND)로 기록하므로 서버 계산에서 그 몫은 0이 된다.
 * `resumeAtMs`가 없으면 선택 없이 시작한다.
 */
export function createSubjectSegmentTracker(
  restored: readonly SubjectSegmentPayload[] = [],
  resumeAtMs?: number,
): SubjectSegmentTracker {
  const closed = [...restored].sort(byStart);
  const last = closed[closed.length - 1];
  return {
    closed,
    current:
      last === undefined || resumeAtMs === undefined
        ? null
        : { subjectId: last.subjectId, startedAtMs: resumeAtMs },
  };
}

/** 지금 구간을 `atMs`에서 닫아 닫힌 목록에 잇는다. 길이가 0 이하면 남기지 않는다(서버가 0초 구간을 거절한다). */
function closeCurrent(tracker: SubjectSegmentTracker, atMs: number): SubjectSegmentPayload[] {
  if (tracker.current === null || atMs <= tracker.current.startedAtMs) {
    return [...tracker.closed];
  }
  return [
    ...tracker.closed,
    {
      subjectId: tracker.current.subjectId,
      startedAt: new Date(tracker.current.startedAtMs).toISOString(),
      endedAt: new Date(atMs).toISOString(),
    },
  ];
}

/**
 * 과목을 고른다(`null`이면 선택 해제). 같은 과목을 다시 고르면 아무 일도 없다 — 구간을 끊어 다시
 * 열어도 합은 같지만 참조가 바뀌어 불필요한 리렌더가 난다. 이전 구간은 `nowMs`에서 닫힌다.
 */
export function selectSubjectSegment(
  tracker: SubjectSegmentTracker,
  next: SubjectSelection | null,
  nowMs: number,
): SubjectSegmentTracker {
  if ((tracker.current?.subjectId ?? null) === next) {
    return tracker;
  }
  return {
    closed: closeCurrent(tracker, nowMs),
    current: next === null ? null : { subjectId: next, startedAtMs: nowMs },
  };
}

/**
 * 서버로 보낼 구간 — 닫힌 구간 + 지금 구간을 `boundaryMs`(스냅샷은 reportedAt, 제출은 endedAt)에서
 * 닫은 것. 마지막 원소가 지금 선택이라 복원 때 그 과목이 되살아난다.
 */
export function materializeSubjectSegments(
  tracker: SubjectSegmentTracker,
  boundaryMs: number,
): SubjectSegmentPayload[] {
  return closeCurrent(tracker, boundaryMs);
}

export interface SubjectTotals {
  readonly studySec: number;
  readonly focusSec: number;
}

function overlapMs(aStartMs: number, aEndMs: number, bStartMs: number, bEndMs: number): number {
  const start = Math.max(aStartMs, bStartMs);
  const end = Math.min(aEndMs, bEndMs);
  return end > start ? end - start : 0;
}

/**
 * 과목별 총공부·순공을 서버와 같은 규칙으로 파생한다 — 구간 길이에서 PAUSE 겹침을 빼면 총공부,
 * 모든 이벤트 겹침을 빼면 순공. 초 절삭도 서버처럼 구간·겹침마다 따로 한다.
 * 화면 표시(시트 라벨·과목 카드)가 쓴다. 서버 저장값은 응답 `subjectSegments[]`의 값이 진실이다.
 */
export function deriveSubjectTotals(
  segments: readonly SubjectSegmentPayload[],
  events: readonly StatusEventPayload[],
): ReadonlyMap<number, SubjectTotals> {
  const totals = new Map<number, SubjectTotals>();
  for (const segment of segments) {
    const startMs = Date.parse(segment.startedAt);
    const endMs = Date.parse(segment.endedAt);
    const lengthSec = Math.floor(Math.max(0, endMs - startMs) / 1000);
    let pauseSec = 0;
    let anySec = 0;
    for (const event of events) {
      const overlapSec = Math.floor(
        overlapMs(startMs, endMs, Date.parse(event.startedAt), Date.parse(event.endedAt)) / 1000,
      );
      anySec += overlapSec;
      if (event.status === "PAUSE") {
        pauseSec += overlapSec;
      }
    }
    const prev = totals.get(segment.subjectId) ?? { studySec: 0, focusSec: 0 };
    totals.set(segment.subjectId, {
      studySec: prev.studySec + Math.max(0, lengthSec - pauseSec),
      focusSec: prev.focusSec + Math.max(0, lengthSec - anySec),
    });
  }
  return totals;
}

/** 화면 표시용 — 이 세션에서 해당 과목에 쌓인 시간. 구간이 없으면 0이다. */
export function liveSubjectTime(
  totals: ReadonlyMap<number, SubjectTotals>,
  subjectId: number,
): SubjectTotals {
  return totals.get(subjectId) ?? { studySec: 0, focusSec: 0 };
}
