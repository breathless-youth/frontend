import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { plannerDayQuery, plannerKeys } from "@/lib/plannerQueries";

import { plannerPlanModel } from "./plannerPlanModel";
import { usePlannerClock } from "./usePlannerClock";

export function usePlannerPlan(userId: number | null, dateKey: string) {
  const { todayKey, timeZone } = usePlannerClock();
  const queryClient = useQueryClient();
  const previousClock = useRef({ todayKey, timeZone });
  const query = useQuery({
    ...plannerDayQuery(userId ?? 0, dateKey, timeZone),
    enabled: userId !== null,
  });
  useEffect(() => {
    const previous = previousClock.current;
    previousClock.current = { todayKey, timeZone };
    if (userId !== null && previous.timeZone === timeZone && previous.todayKey !== todayKey) {
      void queryClient.invalidateQueries({ queryKey: plannerKeys.day(userId, dateKey, timeZone) });
    }
  }, [queryClient, userId, dateKey, todayKey, timeZone]);
  return {
    ...query,
    plan: query.data === undefined ? undefined : plannerPlanModel(query.data, todayKey),
  };
}
