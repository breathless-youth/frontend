import { completeHomeMissionStep, getHomeMission } from "@/lib/homeMissionApi";
import { getPlannerDay, setPlannerDefaultGoal, setPlannerGoal } from "@/lib/plannerApi";
import { assertCurrentUserId } from "@/lib/userId";

import type { HomeV3Gateway } from "./HomeV3Gateway";

/** 요청 사이에 계정이 바뀌면 이전 화면의 후속 저장·세션 시작을 중단한다. */
export function createHomeV3Gateway(
  userId: number,
  start: (subjectId: number | null) => Promise<void> | void,
): HomeV3Gateway {
  return {
    readMission: async (signal) => {
      signal.throwIfAborted();
      assertCurrentUserId(userId);
      const result = await getHomeMission(signal);
      signal.throwIfAborted();
      assertCurrentUserId(userId);
      return result;
    },
    acknowledgeMission: async (step) => {
      assertCurrentUserId(userId);
      const result = await completeHomeMissionStep(step);
      assertCurrentUserId(userId);
      return result;
    },
    readPlannerDay: async (day, signal) => {
      signal.throwIfAborted();
      assertCurrentUserId(userId);
      const result = await getPlannerDay(day.dateKey, { timeZone: day.timeZone, signal });
      signal.throwIfAborted();
      assertCurrentUserId(userId);
      return result;
    },
    saveDateGoal: async (day, seconds) => {
      assertCurrentUserId(userId);
      const result = await setPlannerGoal(
        day.dateKey,
        { goalSec: seconds },
        { timeZone: day.timeZone, calendar: "HOME" },
      );
      assertCurrentUserId(userId);
      return result;
    },
    saveDefaultGoal: async (day, seconds) => {
      assertCurrentUserId(userId);
      const result = await setPlannerDefaultGoal({ goalSec: seconds }, { timeZone: day.timeZone });
      assertCurrentUserId(userId);
      return result;
    },
    startStudy: async (subjectId) => {
      assertCurrentUserId(userId);
      await start(subjectId);
    },
  };
}
