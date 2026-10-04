import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { StudySessionListResponse } from "@focusmakers/types";

import { addDaysToDateKey, kstDateKey } from "@/features/records/recordsFormat";
import { dailyStatsQuery } from "@/lib/statsQueries";

import { assemblePlannerDay, type PlannerDay } from "./plannerDay";

export type PlannerDayState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "success"; day: PlannerDay };

/** 아직 오지 않은 날짜의 조회를 대신하는 빈 응답 — 오늘 플래너의 "다음 날"이 여기에 해당한다. */
const EMPTY_STATS: StudySessionListResponse = {
  sessions: [],
  sessionCount: 0,
  totalStudySec: 0,
  totalFocusSec: 0,
  longestFocusSec: 0,
  focusRate: 0,
  totalEventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
  studiedDatesInMonth: [],
  subjects: [],
};

/**
 * 플래너 하루 조회 훅
 *
 * 플래너의 하루(05:00~다음 날 05:00)는 서버의 날짜 둘에 걸친다. 일간 조회를 그 날짜와 다음 날짜
 * 두 번 받아 `assemblePlannerDay`로 조립한다(서버 변경 없음). 기록 탭 일간 뷰와 같은 쿼리 키를
 * 써서, 기록 탭에서 넘어오면 그날 조회는 캐시로 바로 그려진다.
 */
export function usePlannerDay(userId: number | null, dateKey: string): PlannerDayState {
  const nextKey = addDaysToDateKey(dateKey, 1);
  // 다음 날이 아직 오지 않았으면 조회하지 않는다 — 기록이 있을 수 없다.
  const nextIsFuture = nextKey > kstDateKey();

  const day = useQuery({ ...dailyStatsQuery(userId ?? 0, dateKey), enabled: userId != null });
  const next = useQuery({
    ...dailyStatsQuery(userId ?? 0, nextKey),
    enabled: userId != null && !nextIsFuture,
  });

  const dayData = day.data;
  const nextData = nextIsFuture ? EMPTY_STATS : next.data;
  const assembled = useMemo(
    () =>
      dayData !== undefined && nextData !== undefined
        ? assemblePlannerDay(dateKey, dayData, nextData)
        : null,
    [dateKey, dayData, nextData],
  );

  if (assembled !== null) {
    return { status: "success", day: assembled };
  }
  if (day.isError || next.isError) {
    return {
      status: "error",
      retry: () => {
        if (day.isError) {
          void day.refetch();
        }
        if (next.isError) {
          void next.refetch();
        }
      },
    };
  }
  return { status: "pending" };
}
