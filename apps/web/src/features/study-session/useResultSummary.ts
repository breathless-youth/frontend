import { useQuery } from "@tanstack/react-query";

import { todayKstDateKey } from "@/lib/dateKst";
import { dailyStatsQuery, studyDaysQuery } from "@/lib/statsQueries";

/** 요약 카드 한 행의 상태 — 값을 못 받았을 때 숫자를 지어내지 않는다. */
export type SummaryValueState =
  { status: "pending" } | { status: "error" } | { status: "success"; value: number };

export interface ResultSummary {
  /** 오늘(KST) 순공 합계(초) — 방금 끝난 세션이 이미 포함된 서버 값이다. */
  todayFocusSec: SummaryValueState;
  /** 지금까지 공부 기록이 있는 날 수(서버 `totalDays`). */
  studyDays: SummaryValueState;
}

/**
 * S4 요약 카드 데이터 — `오늘 누적 순공시간`·`누적 공부 일 수`.
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
  const daily = useQuery(dailyStatsQuery(userId, todayKstDateKey()));
  const studyDays = useQuery(studyDaysQuery(userId));

  return {
    todayFocusSec: toState(daily.data?.totalFocusSec, daily.isError),
    studyDays: toState(studyDays.data?.totalDays, studyDays.isError),
  };
}

function toState(value: number | undefined, isError: boolean): SummaryValueState {
  if (value !== undefined) {
    return { status: "success", value };
  }
  return isError ? { status: "error" } : { status: "pending" };
}
