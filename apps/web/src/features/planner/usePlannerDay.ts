import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { syncProfileTimeZone } from "@/features/profile/useTimeZoneSync";
import { addDaysToDateKey } from "@/features/records/recordsFormat";
import { listStudySessionStats } from "@/lib/statsApi";
import { dailyStatsQuery, statsKeys } from "@/lib/statsQueries";

import { EMPTY_STATS, assemblePlannerDay, type PlannerDay } from "./plannerDay";
import { usePlannerClock } from "./usePlannerClock";
import { localDateKey } from "@/lib/dateKey";

export type PlannerDayState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "success"; day: PlannerDay };

/**
 * 플래너 하루 조회 훅
 *
 * 플래너의 하루(05:00~다음 날 05:00)는 서버의 날짜 둘에 걸친다. 일간 조회를 그 날짜와 다음 날짜
 * 두 번 받아 `assemblePlannerDay`로 조립한다. 기록 탭 일간 뷰와 같은 쿼리 키를 써서, 기록 탭에서
 * 넘어오면 그날 조회는 캐시로 바로 그려진다.
 *
 * 완료한 할 일도 같은 두 응답에 실려 온다(`subjects[].tasks`). 지난 날 플래너는 그것을 쓰므로 열 때마다 다시
 * 받는다 — 할 일을 체크·해제·삭제해도 일간 조회를 따로 무효화하지 않아서다. 캐시가 있으면 먼저 그리고
 * 뒤에서 갱신한다. 오늘은 과목 목록이, 미래는 미완료 할 일이 완료 기록을 대신하므로 그럴 필요가 없다.
 */
export function usePlannerDay(userId: number | null, dateKey: string): PlannerDayState {
  const nextKey = addDaysToDateKey(dateKey, 1);
  // 아직 오지 않은 날짜는 조회하지 않는다 — 기록이 있을 수 없다. 미래 날짜의 플래너는 둘 다 건너뛴다.
  const { todayKey, timeZone, nowMs } = usePlannerClock();
  const queryClient = useQueryClient();
  const previousClock = useRef({ todayKey, timeZone });
  const dayIsFuture = dateKey > todayKey;
  // 새벽 기록은 다음 달력 날짜의 응답에 들어 있어 05시 오늘 판정과 구분한다.
  const nextIsFuture = dayIsFuture || nextKey > localDateKey(new Date(nowMs), timeZone);

  // 지난 날은 열 때와 날짜를 넘길 때 모두 새로 받는다. refetchOnMount는 마운트에만 듣고, 같은 화면에서
  // 날짜만 바뀌면(쿼리 키 변경) staleTime을 따르므로 둘 다 준다.
  const freshOnOpen =
    dateKey < todayKey ? ({ staleTime: 0, refetchOnMount: "always" } as const) : {};

  const syncedStatsQuery = (calendarDate: string) => ({
    ...dailyStatsQuery(userId ?? 0, calendarDate),
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      await syncProfileTimeZone(userId ?? 0, timeZone);
      signal.throwIfAborted();
      return listStudySessionStats(calendarDate);
    },
  });

  const day = useQuery({
    ...syncedStatsQuery(dateKey),
    ...freshOnOpen,
    enabled: userId != null && !dayIsFuture,
  });
  const next = useQuery({
    ...syncedStatsQuery(nextKey),
    ...freshOnOpen,
    enabled: userId != null && !nextIsFuture,
  });

  useEffect(() => {
    const previous = previousClock.current;
    previousClock.current = { todayKey, timeZone };
    if (userId === null || (previous.todayKey === todayKey && previous.timeZone === timeZone))
      return;

    if (previous.timeZone !== timeZone) {
      void queryClient.invalidateQueries({ queryKey: statsKeys.all, refetchType: "none" });
    }
    // 화면을 둔 채 05시를 넘기면 완료 목록의 출처가 바뀐다. 키가 같아도 두 날짜를 다시 받는다.
    void queryClient.invalidateQueries({ queryKey: statsKeys.daily(userId, dateKey) });
    void queryClient.invalidateQueries({ queryKey: statsKeys.daily(userId, nextKey) });
  }, [queryClient, userId, dateKey, nextKey, todayKey, timeZone]);

  const dayData = dayIsFuture ? EMPTY_STATS : day.data;
  const nextData = nextIsFuture ? EMPTY_STATS : next.data;
  const assembled =
    dayData !== undefined && nextData !== undefined
      ? assemblePlannerDay(dateKey, dayData, nextData, timeZone)
      : null;

  if ((!dayIsFuture && day.isError) || (!nextIsFuture && next.isError)) {
    return {
      status: "error",
      retry: () => {
        if (!dayIsFuture && day.isError) {
          void day.refetch();
        }
        if (!nextIsFuture && next.isError) {
          void next.refetch();
        }
      },
    };
  }
  if (assembled !== null) {
    return { status: "success", day: assembled };
  }
  return { status: "pending" };
}
