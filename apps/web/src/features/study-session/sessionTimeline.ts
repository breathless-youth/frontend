import type { StatusEventPayload } from "@focuson/types";

import type { SessionState } from "./sessionState";
import {
  FOCUS_STATE,
  isFocusRunning,
  isSameSessionState,
  isStudyRunning,
  toEventStatus,
} from "./sessionState";

/**
 * 세션 타임라인 — 상태 구간의 나열. 순수 TS(React/DOM 의존 없음)라 훅과 무관하게 단위 테스트한다.
 *
 * 여기서 순공(focusSec)·총 공부(studySec)를 **2축으로** 계산하고, 서버로 보낼
 * `StatusEventPayload[]`를 만든다. 화면 컴포넌트는 이 계산에 관여하지 않는다
 * (`apps/web/CLAUDE.md` — 공부 상태·집중률 계산은 화면 컴포넌트에서 직접 구현하지 않는다).
 */

/** 서버 검증 규칙상 0초 이벤트는 보낼 수 없다 — 이 값 미만 구간은 이벤트로 기록하지 않는다. */
const MIN_EVENT_MS = 1000;

export interface SessionSegment {
  readonly state: SessionState;
  readonly startedAtMs: number;
  /** null이면 아직 진행 중인 마지막 구간. */
  readonly endedAtMs: number | null;
}

export interface SessionTimeline {
  readonly startedAtMs: number;
  readonly segments: readonly SessionSegment[];
}

export interface SessionTotals {
  /** 총 공부 시간(초) — 일시정지 구간 제외. */
  readonly studySec: number;
  /** 순공 시간(초) — 비집중·일시정지 구간 제외. */
  readonly focusSec: number;
  /** 일시정지 누적(초) — 벽시계 기준 별도 집계(2026-07-26 확정). */
  readonly pauseSec: number;
  /** 비집중 누적(초) — 총 공부에는 포함되고 순공에서만 빠지는 시간. */
  readonly distractionSec: number;
}

export function createSessionTimeline(
  startedAtMs: number,
  initialState: SessionState = FOCUS_STATE,
): SessionTimeline {
  return {
    startedAtMs,
    segments: [{ state: initialState, startedAtMs, endedAtMs: null }],
  };
}

function lastSegment(timeline: SessionTimeline): SessionSegment {
  const segment = timeline.segments[timeline.segments.length - 1];
  if (segment === undefined) {
    throw new Error("SessionTimeline에는 최소 한 개의 구간이 있어야 합니다");
  }
  return segment;
}

export function currentState(timeline: SessionTimeline): SessionState {
  return lastSegment(timeline).state;
}

/** 현재 상태가 시작된 시각 — 일시정지 N분 자동 종료(WG4) 같은 경과 감시에 쓴다. */
export function currentStateSinceMs(timeline: SessionTimeline): number {
  return lastSegment(timeline).startedAtMs;
}

export function isClosed(timeline: SessionTimeline): boolean {
  return lastSegment(timeline).endedAtMs !== null;
}

/**
 * 상태 전이. 같은 상태로의 전이는 무시하고(구간이 쪼개지지 않는다),
 * 시각이 거꾸로 들어오면 직전 구간 시작 시각으로 클램프한다.
 * 이미 닫힌 타임라인에는 전이를 적용하지 않는다.
 */
export function transition(
  timeline: SessionTimeline,
  next: SessionState,
  atMs: number,
): SessionTimeline {
  const current = lastSegment(timeline);
  if (current.endedAtMs !== null) {
    return timeline;
  }
  if (isSameSessionState(current.state, next)) {
    return timeline;
  }
  const boundaryMs = Math.max(atMs, current.startedAtMs);
  return {
    startedAtMs: timeline.startedAtMs,
    segments: [
      ...timeline.segments.slice(0, -1),
      { ...current, endedAtMs: boundaryMs },
      { state: next, startedAtMs: boundaryMs, endedAtMs: null },
    ],
  };
}

/** 세션 종료 — 마지막 구간을 닫는다. 이미 닫혀 있으면 그대로 둔다(재시도 시 멱등). */
export function closeSessionTimeline(
  timeline: SessionTimeline,
  endedAtMs: number,
): SessionTimeline {
  const current = lastSegment(timeline);
  if (current.endedAtMs !== null) {
    return timeline;
  }
  return {
    startedAtMs: timeline.startedAtMs,
    segments: [
      ...timeline.segments.slice(0, -1),
      { ...current, endedAtMs: Math.max(endedAtMs, current.startedAtMs) },
    ],
  };
}

function segmentDurationMs(segment: SessionSegment, nowMs: number): number {
  const endMs = segment.endedAtMs ?? nowMs;
  return Math.max(0, endMs - segment.startedAtMs);
}

/**
 * 두 축 타이머 집계.
 * - 총 공부: 일시정지만 정지 → 비집중 구간도 포함
 * - 순공: 집중 구간만
 */
export function computeSessionTotals(timeline: SessionTimeline, nowMs: number): SessionTotals {
  let studyMs = 0;
  let focusMs = 0;
  let pauseMs = 0;
  let distractionMs = 0;

  for (const segment of timeline.segments) {
    const durationMs = segmentDurationMs(segment, nowMs);
    if (isStudyRunning(segment.state)) {
      studyMs += durationMs;
    } else {
      pauseMs += durationMs;
    }
    if (isFocusRunning(segment.state)) {
      focusMs += durationMs;
    }
    if (segment.state.kind === "DISTRACTION") {
      distractionMs += durationMs;
    }
  }

  return {
    studySec: Math.floor(studyMs / 1000),
    focusSec: Math.floor(focusMs / 1000),
    pauseSec: Math.floor(pauseMs / 1000),
    distractionSec: Math.floor(distractionMs / 1000),
  };
}

/**
 * 서버 전송용 상태 이벤트 목록.
 * 서버 검증 규칙(`packages/types` 주석): 세션 구간 안 · 서로 겹침 불가 · 0초 불가.
 * - 집중 구간은 이벤트로 기록하지 않는다(기본 상태).
 * - 1초 미만 구간은 버린다 → 이벤트 사이에 빈틈이 생길 수 있으나 겹치지는 않는다.
 */
export function toStatusEvents(timeline: SessionTimeline, endedAtMs: number): StatusEventPayload[] {
  const closed = closeSessionTimeline(timeline, endedAtMs);
  const events: StatusEventPayload[] = [];

  for (const segment of closed.segments) {
    const status = toEventStatus(segment.state);
    if (status === null) {
      continue;
    }
    const segmentEndMs = segment.endedAtMs ?? endedAtMs;
    if (segmentEndMs - segment.startedAtMs < MIN_EVENT_MS) {
      continue;
    }
    events.push({
      status,
      startedAt: new Date(segment.startedAtMs).toISOString(),
      endedAt: new Date(segmentEndMs).toISOString(),
    });
  }

  return events;
}
