import { useQuery } from "@tanstack/react-query";

import type { StudySessionListResponse } from "@focusmakers/types";

import { addDaysToDateKey, kstDateKey } from "@/features/records/recordsFormat";
import { dailyStatsQuery } from "@/lib/statsQueries";

import { assemblePlannerDay, type PlannerDay } from "./plannerDay";

export type PlannerDayState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "success"; day: PlannerDay };

/** 아직 오지 않은 날짜의 조회를 대신하는 빈 응답 — 오늘 플래너의 "다음 날"과 미래 날짜의 플래너가 여기에 해당한다. */
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
  const todayKey = kstDateKey();
  const dayIsFuture = dateKey > todayKey;
  const nextIsFuture = nextKey > todayKey;

  const freshOnOpen = dateKey < todayKey ? ({ refetchOnMount: "always" } as const) : {};

  const day = useQuery({
    ...dailyStatsQuery(userId ?? 0, dateKey),
    ...freshOnOpen,
    enabled: userId != null && !dayIsFuture,
  });
  const next = useQuery({
    ...dailyStatsQuery(userId ?? 0, nextKey),
    ...freshOnOpen,
    enabled: userId != null && !nextIsFuture,
  });

  const dayData = dayIsFuture ? EMPTY_STATS : day.data;
  const nextData = nextIsFuture ? EMPTY_STATS : next.data;
  const assembled =
    dayData !== undefined && nextData !== undefined
      ? assemblePlannerDay(dateKey, dayData, nextData)
      : null;

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
