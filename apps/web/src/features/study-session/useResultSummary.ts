import { useQuery } from "@tanstack/react-query";

import { addDaysToDateKey } from "@/features/records/recordsFormat";
import { todayKstDateKey } from "@/lib/dateKst";
import type { DateRange } from "@/lib/statsApi";
import { getPeriodStats } from "@/lib/statsApi";
import { dailyStatsQuery, statsKeys } from "@/lib/statsQueries";

/** 누적 공부 일 수 조회 시작일 — 서비스에 이 날짜보다 앞선 세션은 없다(2026년 시작). */
export const STUDY_DAYS_FROM = "2026-01-01";

/** 기간 집계 API가 한 번에 받는 상한(서버 `MAX_PERIOD_DAYS`) — 넘기면 400. */
const PERIOD_MAX_DAYS = 366;

/**
 * 누적 공부 일 수 — 지금까지 공부 기록이 있는 날(KST `statDate`)의 수(2026-09-14 사용자 확정).
 *
 * 서버에 바로 주는 API가 없어 기간 집계(`GET /api/stats/period`)의 일별 배열에서 `studySec > 0`인
 * 날을 센다. 순공 1분 미만 세션은 서버 집계에서 빠지므로 기록 화면(S5)에 보이는 날과 같은 기준이다.
 * 스트릭(`/api/stats/streak`, 하루 순공 10분 기준)과는 다르다 — 그쪽은 쓰지 않는다.
 *
 * 기간 API는 366일 상한이 있어 시작일부터 오늘까지를 창으로 잘라 묻고 합친다(지금은 1창,
 * 2027년부터 2창). 서버가 누적 일 수를 직접 주게 되면 이 함수를 그 값으로 바꾸면 된다.
 */
export async function countStudyDays(userId: number, from: string, to: string): Promise<number> {
  const responses = await Promise.all(
    splitDateRange(from, to, PERIOD_MAX_DAYS).map((range) => getPeriodStats(userId, range)),
  );
  return responses.flatMap((response) => response.dailyList).filter((day) => day.studySec > 0)
    .length;
}

/** `[from, to]`를 양끝 포함 최대 `maxDays`일 창으로 자른다. `from > to`면 빈 배열. */
export function splitDateRange(from: string, to: string, maxDays: number): DateRange[] {
  const windows: DateRange[] = [];
  for (let start = from; start <= to; start = addDaysToDateKey(start, maxDays)) {
    const end = addDaysToDateKey(start, maxDays - 1);
    windows.push({ from: start, to: end < to ? end : to });
  }
  return windows;
}

/** 요약 카드 한 행의 상태 — 값을 못 받았을 때 숫자를 지어내지 않는다. */
export type SummaryValueState =
  { status: "pending" } | { status: "error" } | { status: "success"; value: number };

export interface ResultSummary {
  /** 오늘(KST) 순공 합계(초) — 방금 끝난 세션이 이미 포함된 서버 값이다. */
  todayFocusSec: SummaryValueState;
  /** 지금까지 공부 기록이 있는 날 수(`countStudyDays`). */
  studyDays: SummaryValueState;
}

/**
 * S4 요약 카드 데이터(BY-560) — `오늘 누적 순공시간`·`누적 공부 일 수`.
 *
 * 두 행은 서로 다른 조회에서 오므로 **행마다 따로** 상태를 갖는다 — 한쪽이 실패해도 다른 쪽은
 * 보여준다. 오늘 합계는 홈(S1)과 같은 `dailyStatsQuery(userId, 오늘)`라 캐시를 공유한다. 두 키 모두
 * `stats`로 시작해 세션 제출·복구·모달 닫힘의 `statsKeys.all` 무효화가 함께 갱신한다.
 * 브라우저 단독 모드에서는 세션 제출 성공이 stats 키를 무효화해(`useStudyRoomSession`) 세션 전
 * 값이 남지 않고, 네이티브 웹뷰에서는 세션 문서가 홈과 별도라 처음 조회한다.
 *
 * 세션이 자정(KST)을 넘겨 분할된 경우 "오늘"은 화면이 그리는 첫 세션의 귀속 날짜가 아니라
 * 실제 오늘이다 — 라벨이 `오늘 누적`이므로 오늘 값을 보여주는 게 맞다.
 */
export function useResultSummary(userId: number): ResultSummary {
  const todayKey = todayKstDateKey();
  const daily = useQuery(dailyStatsQuery(userId, todayKey));
  const studyDays = useQuery({
    queryKey: [...statsKeys.all, "studyDays", userId, todayKey] as const,
    queryFn: () => countStudyDays(userId, STUDY_DAYS_FROM, todayKey),
  });

  return {
    todayFocusSec: toState(daily.data?.totalFocusSec, daily.isError),
    studyDays: toState(studyDays.data, studyDays.isError),
  };
}

function toState(value: number | undefined, isError: boolean): SummaryValueState {
  if (value !== undefined) {
    return { status: "success", value };
  }
  return isError ? { status: "error" } : { status: "pending" };
}
