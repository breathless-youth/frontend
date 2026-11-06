import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { mondayWeekDateKeys } from "@/features/records/recordsPeriod";
import { plannerDayQuery, plannerKeys } from "@/lib/plannerQueries";
import { plannerWeek, previewWeekTaskMove } from "./plannerWeekModel";
import { usePlannerClock } from "./usePlannerClock";
import { usePlannerPlanMutation } from "./usePlannerPlanMutation";

export function usePlannerWeek(userId: number | null, dateKey: string) {
  const { todayKey, timeZone } = usePlannerClock();
  const dates = mondayWeekDateKeys(dateKey);
  const weekStart = dates[0]!;
  const client = useQueryClient();
  const previousClock = useRef({ todayKey, timeZone });
  const queries = useQueries({
    queries: dates.map((date) => ({
      ...plannerDayQuery(userId ?? 0, date, timeZone),
      enabled: userId !== null,
    })),
  });
  const mutation = usePlannerPlanMutation(userId);
  const [preview, setPreview] = useState<{
    userId: number | null;
    key: string;
    date: string;
    weekStart: string;
    timeZone: string;
  } | null>(null);
  useEffect(() => {
    const previous = previousClock.current;
    previousClock.current = { todayKey, timeZone };
    if (userId !== null && previous.timeZone === timeZone && previous.todayKey !== todayKey) {
      for (const date of mondayWeekDateKeys(weekStart)) {
        void client.invalidateQueries({ queryKey: plannerKeys.day(userId, date, timeZone) });
      }
    }
  }, [client, userId, weekStart, todayKey, timeZone]);
  const responses = queries.flatMap((query) => (query.data === undefined ? [] : [query.data]));
  const displayed =
    preview?.userId === userId && preview?.weekStart === weekStart && preview.timeZone === timeZone
      ? previewWeekTaskMove(responses, preview.key, preview.date)
      : responses;
  return {
    ...plannerWeek(dateKey, todayKey, displayed),
    todayKey,
    timeZone,
    isPending: userId !== null && queries.some((query) => query.isPending),
    isError: queries.some((query) => query.isError),
    isSaving: mutation.isPending,
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
    toggleTask: (key: string, done: boolean) =>
      mutation.mutateAsync({ kind: "updateTask", key, body: { done } }),
    moveTask: async (key: string, date: string) => {
      if (mutation.isPending || !dates.includes(date) || date < todayKey) return;
      setPreview({ userId, key, date, weekStart, timeZone });
      try {
        await mutation.mutateAsync({ kind: "moveTask", key, body: { date } });
      } finally {
        setPreview(null);
      }
    },
  };
}
