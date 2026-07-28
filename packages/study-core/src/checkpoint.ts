import type { StudyEventStatus } from "@focuson/types";

/**
 * 공부 세션 도메인 타입 — fe 스펙 2·6절(2026-07-26 확정) 그대로.
 * 이 패키지는 순수 TS다: RN·DOM·카메라·네트워크를 모른다.
 */

/** 나열 순서 = 동시 감지 시 대표를 고르는 우선순위 (스펙 4절). */
export const DETECTOR_PRIORITY = ["away", "device", "phone"] as const;

export type DetectorKind = (typeof DETECTOR_PRIORITY)[number];

export type SessionPhase =
  | { kind: "focus" }
  | { kind: "distracted"; reasons: DetectorKind[] }
  | { kind: "paused"; cause: "manual" | "background" };

/** 이미 닫힌 비공부 구간 — 대표 status가 확정된 상태로 담긴다(스펙 6절). */
export interface ClosedInterval {
  status: StudyEventStatus;
  startedAtMs: number;
  endedAtMs: number;
}

export interface SessionCheckpoint {
  schemaVersion: 1;
  /** 로컬 큐 식별자 — 서버 중복 방지는 (userId, startedAt) 복합키가 담당(스펙 11절). */
  sessionId: string;
  startedAtMs: number;
  /** 마지막으로 웹이 살아 있었음이 확인된 시각. */
  lastAliveAtMs: number;
  phase: SessionPhase;
  phaseStartedAtMs: number;
  closedIntervals: ClosedInterval[];
}

const DETECTOR_TO_STATUS: Record<DetectorKind, StudyEventStatus> = {
  away: "AWAY",
  device: "DEVICE",
  phone: "PHONE",
};

/** 열린 비집중 구간을 닫을 때의 대표 status. 빈 배열은 방어적으로 AWAY(측정 불가=자리 이탈 취급). */
export function representativeStatus(reasons: DetectorKind[]): StudyEventStatus {
  const top = DETECTOR_PRIORITY.find((kind) => reasons.includes(kind));
  return top ? DETECTOR_TO_STATUS[top] : "AWAY";
}
