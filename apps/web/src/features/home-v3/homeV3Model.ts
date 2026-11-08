import type { HomeMissionResponse } from "@focusmakers/types";

export type HomeMission = HomeMissionResponse;

export type HomeBand =
  | { kind: "mission"; step: 1 | 2; ready: boolean; progress: number }
  | { kind: "goal-empty" }
  | { kind: "goal"; targetSeconds: number; remainingSeconds: number; percent: number };

export function selectHomeBand(
  mission: HomeMission,
  todayFocusSeconds: number,
  goalSeconds: number | null,
): HomeBand {
  if (mission.currentStep !== null) {
    return {
      kind: "mission",
      step: mission.currentStep,
      ready: mission.eligible,
      progress: mission.completedSteps / 2,
    };
  }
  if (goalSeconds === null || goalSeconds <= 0) return { kind: "goal-empty" };
  const focus = Math.max(0, todayFocusSeconds);
  return {
    kind: "goal",
    targetSeconds: goalSeconds,
    remainingSeconds: Math.max(0, goalSeconds - focus),
    percent: Math.min(100, Math.round((focus / goalSeconds) * 100)),
  };
}

/** 홈 시안은 시 자리를 0으로 채우지 않는 누적 시간 표기를 쓴다. */
export function homeClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 3600)}:${String(Math.floor(total / 60) % 60).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function homeDateLabel(dateKey: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T12:00:00Z`));
}
