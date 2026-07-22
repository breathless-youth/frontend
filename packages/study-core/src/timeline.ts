import { computeFocusRate } from "./focusRate";
import type { FocusTimelineEvent, StudySessionSummary, StudyStatus } from "./types";

/** 총공부시간에 포함되는 상태: 공부 중 + 자리 비움. */
const TOTAL_STUDY_STATUSES: ReadonlySet<StudyStatus> = new Set<StudyStatus>(["STUDYING", "AWAY"]);
/** 순공시간에 포함되는 상태: 공부 중만. */
const PURE_STUDY_STATUSES: ReadonlySet<StudyStatus> = new Set<StudyStatus>(["STUDYING"]);

/**
 * 타임라인을 계산 가능한 형태로 정규화한다.
 * - 유한하지 않은 timestamp 이벤트 제거.
 * - timestamp 오름차순 정렬(역순/뒤섞인 입력 방어).
 * - 연속으로 같은 상태가 이어지면 병합(중복 이벤트 방어).
 */
export function normalizeTimeline(events: readonly FocusTimelineEvent[]): FocusTimelineEvent[] {
  const sorted = events
    .filter((event) => Number.isFinite(event.timestampMs))
    .slice()
    .sort((a, b) => a.timestampMs - b.timestampMs);

  const result: FocusTimelineEvent[] = [];
  for (const event of sorted) {
    const last = result[result.length - 1];
    if (last && last.status === event.status) {
      continue;
    }
    result.push({ status: event.status, timestampMs: event.timestampMs });
  }
  return result;
}

/**
 * 타임라인 이벤트들과 종료 시각으로부터 세션 요약을 계산한다.
 * 각 이벤트는 다음 이벤트(마지막이면 endTimestampMs)까지 그 상태를 유지한 것으로 본다.
 * - STUDYING/AWAY 구간만 총공부시간에 누적, STUDYING 구간만 순공시간에 누적.
 * - PAUSED/CAMERA_OFF 구간은 총공부시간·순공시간 모두 미포함.
 * - 음수 구간(종료 시각이 마지막 이벤트보다 앞서는 경우 등)은 0으로 클램프.
 */
export function summarizeTimeline(
  events: readonly FocusTimelineEvent[],
  endTimestampMs: number,
): StudySessionSummary {
  const timeline = normalizeTimeline(events);

  let totalMs = 0;
  let pureMs = 0;
  for (let i = 0; i < timeline.length; i += 1) {
    const current = timeline[i];
    if (!current) {
      continue;
    }
    const next = timeline[i + 1];
    const intervalEndMs = next ? next.timestampMs : endTimestampMs;
    const durationMs = Math.max(0, intervalEndMs - current.timestampMs);

    if (TOTAL_STUDY_STATUSES.has(current.status)) {
      totalMs += durationMs;
    }
    if (PURE_STUDY_STATUSES.has(current.status)) {
      pureMs += durationMs;
    }
  }

  const totalStudySeconds = Math.floor(totalMs / 1000);
  const pureStudySeconds = Math.floor(pureMs / 1000);
  return {
    totalStudySeconds,
    pureStudySeconds,
    focusRate: computeFocusRate(pureStudySeconds, totalStudySeconds),
  };
}
