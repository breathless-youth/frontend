import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { StudySessionListResponse } from "@focusmakers/types";
import { dailyStatsQuery, streakQuery } from "@/lib/statsQueries";

import {
  type CalendarMonth,
  isDateKeyInMonth,
  statsQueryDateKey,
  weekDateKeys,
} from "./recordsFormat";

export type RecordsDayState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "success"; stats: StudySessionListResponse };

export type StreakBannerState =
  | { status: "pending" }
  | { status: "hidden" }
  | { status: "success"; streakDays: number; doneDates: readonly string[] };

/**
 * S5 기록 조회 훅 (`apps/mobile/components/records/useRecordsData.ts`에서 이식 — BY-330).
 * 선택일 통계와 보이는 달의 달력 도트를 조회한다. 화면은 이 훅의 상태만 알고 데이터 배선은
 * 모른다(홈 useHomeSummary와 같은 방침).
 *
 * 모바일판과의 차이(BY-329가 홈에서 확정한 것과 동일 방침):
 * - userId는 익명 등록 쿼리(`registeredUserIdQuery`)가 아니라 **셸이 준 URL 파라미터**를
 *   인자로 받는다(등록은 네이티브 소유) — 화면 진입 시 아직 없을 수 있어 `number | null`이다.
 * - 탭 재진입 갱신은 `useFocusEffect` 대신 react-query 기본값(`refetchOnWindowFocus`)이 맡는다 —
 *   웹뷰가 다시 보이면 stale 쿼리가 재조회된다.
 *
 * 달 이동은 선택일에 영향을 주지 않는다(2026-07-28 확정 — "선택 없음" 상태는 없다). 보이는 달에
 * 선택일이 없으면 그 달 1일로 추가 조회해 `studiedDatesInMonth`만 쓴다 — 선택일 요약·리스트는
 * react-query 캐시로 계속 표시된다. 조회 실패 시에도 캐시가 있으면 success를 유지한다
 * (`day.data` 우선 분기가 그 역할이다).
 */
export function useRecordsData(
  userId: number | null,
  selectedKey: string,
  month: CalendarMonth,
  todayKey: string,
): { day: RecordsDayState; studiedDates: readonly string[]; streakBanner: StreakBannerState } {
  // "선택일이 보이는 달에 속하는가"를 직접 판단한다 (리뷰 반영 — 반환값 문자열 비교로 간접
  // 추론하지 않는다). monthDateKey는 같은 규칙을 공유하므로 selectedInMonth일 때 selectedKey다.
  const selectedInMonth = isDateKeyInMonth(selectedKey, month);
  const monthDateKey = statsQueryDateKey(selectedKey, month);

  const day = useQuery({
    ...dailyStatsQuery(userId ?? 0, selectedKey),
    enabled: userId != null,
    // 날짜를 바꾸는 동안 직전 응답을 placeholder로 유지한다 — 도트(studiedDatesInMonth)가
    // 새 조회 동안 undefined로 비어 깜빡이는 것을 막는다. 요약·리스트는 아래 분기에서
    // placeholder를 pending으로 취급해, 새 날짜 제목 아래 이전 날짜 데이터가 보이지 않게 한다.
    placeholderData: keepPreviousData,
  });
  const monthStats = useQuery({
    ...dailyStatsQuery(userId ?? 0, monthDateKey),
    enabled: userId != null && !selectedInMonth,
  });
  const weekStart = weekDateKeys(todayKey)[0];
  const streak = useQuery({
    ...streakQuery(userId ?? 0, { from: weekStart, to: todayKey }),
    enabled: userId != null,
    // 자정 넘김으로 주 범위 키가 바뀌는 순간 직전 데이터를 유지해 배너가 스켈레톤으로 깜빡이지 않게 한다.
    placeholderData: keepPreviousData,
  });

  // useCallback으로 감싸지 않는다(리뷰 반영) — retry는 렌더마다 새로 만들어지는 반환 객체(day)에
  // 실려 나가므로 참조를 안정화해도 소비자 입장에선 이득이 없다. 일반 함수가 의도를 정직하게 드러낸다.
  const retry = () => {
    if (day.isError) {
      void day.refetch();
    }
    if (monthStats.isError) {
      void monthStats.refetch();
    }
    if (streak.isError) {
      void streak.refetch();
    }
  };

  // 도트 조회 실패는 화면을 막지 않는다 — 빈 배열로 두면 도트만 안 찍힌다(포커스 재조회로 복구).
  const studiedDates =
    (selectedInMonth ? day.data?.studiedDatesInMonth : monthStats.data?.studiedDatesInMonth) ?? [];

  // 배너 상태(2026-07-28 확정): 캐시 있으면 success 유지, 실패(캐시 없음)면 숨김 —
  // 틀린 "0일째"를 보여주지 않는다. 오류 안내·재시도는 일별 기록 영역 ErrorState가 대표한다.
  // 스트릭·달 도트 단독 실패는 재시도 UI 없이 hidden/빈 도트로 남는다(원본 동일) —
  // refetchOnWindowFocus가 복구 경로다.
  const streakBanner: StreakBannerState =
    streak.data !== undefined
      ? {
          status: "success",
          streakDays: streak.data.streak,
          // 계약상 필수 필드지만 서버 계약 드리프트 시 오류 없이 도트만 전부 비는 무증상
          // 실패가 되므로 방어한다(2026-07-28 리뷰 반영) — 빈 배열이면 도트만 안 찍힌다.
          doneDates: streak.data.studiedDatesInRange ?? [],
        }
      : streak.isError
        ? { status: "hidden" }
        : { status: "pending" };

  if (day.data !== undefined && !day.isPlaceholderData) {
    return { day: { status: "success", stats: day.data }, studiedDates, streakBanner };
  }
  if (day.isError) {
    return { day: { status: "error", retry }, studiedDates, streakBanner };
  }
  return { day: { status: "pending" }, studiedDates, streakBanner };
}
