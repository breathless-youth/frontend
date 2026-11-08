import type { HomeMission } from "./homeV3Model";
import type {
  PlannerDayResponse,
  PlannerGoalResponse,
  PlannerDefaultGoalResponse,
} from "@focusmakers/types";

export interface HomeDay {
  dateKey: string;
  timeZone: string;
}
export interface HomeGoal {
  seconds: number | null;
  defaultSeconds: number | null;
  remainingTasks?: number;
}

/**
 * 홈이 필요로 하는 동작의 경계이며 HTTP 계약이 아니다.
 * 실제 미션 API와 플래너 원본 day 캐시를 함께 사용한다.
 * startStudy는 기존 가이드·권한·세션 복원 흐름과 분석 이벤트를 유지해야 한다.
 */
export interface HomeV3Gateway {
  readMission: (signal: AbortSignal) => Promise<HomeMission>;
  acknowledgeMission: (step: 1 | 2) => Promise<HomeMission>;
  readPlannerDay: (day: HomeDay, signal: AbortSignal) => Promise<PlannerDayResponse>;
  saveDateGoal: (day: HomeDay, seconds: number) => Promise<PlannerGoalResponse>;
  saveDefaultGoal: (day: HomeDay, seconds: number) => Promise<PlannerDefaultGoalResponse>;
  startStudy: (subjectId: number | null) => Promise<void> | void;
}
