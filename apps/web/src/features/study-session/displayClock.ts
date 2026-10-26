import type { StatusEventPayload } from "@focusmakers/types";

import type { SessionTimeline } from "./sessionTimeline";
import type { SubjectSegmentTracker } from "./subjectSegments";

const SECOND_MS = 1000;

/**
 * 화면 표시용 1초 눈금
 *
 * 순공·총 공부·과목 시간은 밀리초 경계가 제각각이라 따로 초로 내리면 서로 다른 순간에 바뀐다.
 * 화면에 보일 값만 지금 시각과 모든 구간 경계를 세션 시작 기준 1초 눈금으로 내려 구간 길이를 정수 초로 만든다.
 * 경계를 반올림하면 화면의 지금 시각보다 늦게 놓일 수 있어 과목 시간이 순공과 다른 순간에 바뀐다.
 * 내림이라 표시값과 서버 기록의 차이는 경계 하나당 1초 미만이다.
 * 서버로 보내는 값은 이 모듈을 거치지 않는다.
 */
export function floorToSecondGrid(ms: number, originMs: number): number {
  return originMs + Math.floor((ms - originMs) / SECOND_MS) * SECOND_MS;
}

function snapIso(iso: string, originMs: number): string {
  return new Date(floorToSecondGrid(Date.parse(iso), originMs)).toISOString();
}

export function snapTimeline(timeline: SessionTimeline, originMs: number): SessionTimeline {
  return {
    startedAtMs: floorToSecondGrid(timeline.startedAtMs, originMs),
    segments: timeline.segments.map((segment) => ({
      ...segment,
      startedAtMs: floorToSecondGrid(segment.startedAtMs, originMs),
      endedAtMs: segment.endedAtMs === null ? null : floorToSecondGrid(segment.endedAtMs, originMs),
    })),
  };
}

export function snapStatusEvents(
  events: readonly StatusEventPayload[],
  originMs: number,
): StatusEventPayload[] {
  return events.map((event) => ({
    ...event,
    startedAt: snapIso(event.startedAt, originMs),
    endedAt: snapIso(event.endedAt, originMs),
  }));
}

export function snapSubjectTracker(
  tracker: SubjectSegmentTracker,
  originMs: number,
): SubjectSegmentTracker {
  return {
    closed: tracker.closed.map((segment) => ({
      ...segment,
      startedAt: snapIso(segment.startedAt, originMs),
      endedAt: snapIso(segment.endedAt, originMs),
    })),
    current:
      tracker.current === null
        ? null
        : {
            ...tracker.current,
            startedAtMs: floorToSecondGrid(tracker.current.startedAtMs, originMs),
          },
  };
}
