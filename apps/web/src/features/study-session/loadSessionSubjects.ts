import type { StudySessionListResponse, SubjectResponse } from "@focusmakers/types";

import { EMPTY_STATS, assemblePlannerDay, plannerDateKeyOf } from "@/features/planner/plannerDay";
import { plannerSubjectItems } from "@/features/planner/subjectItems";
import { addDaysToDateKey, kstDateKey } from "@/features/records/recordsFormat";
import { queryClient } from "@/lib/queryClient";
import { reportHandled } from "@/lib/sentry";
import { dailyStatsQuery } from "@/lib/statsQueries";
import { listSubjects } from "@/lib/subjectApi";

/**
 * 세션 화면의 과목 목록
 *
 * 각 과목의 `focusSec`을 서버 누적 대신 플래너 하루(05:00~다음 날 05:00) 기준 오늘 저장 기록으로 바꿔 돌려준다.
 * 플래너와 같은 함수로 계산해 같은 날짜의 플래너와 같은 값이고, 화면은 여기에 이번 세션 몫을 더한다.
 * 일간 조회는 싱글턴 queryClient로 받아 홈·기록·플래너와 캐시를 나눈다.
 * 세션 화면은 Provider 없이도 렌더되므로(`useSubjects` 주석) useQuery를 쓰지 않는다.
 * 일간 조회가 실패하면 목록은 유지하고 오늘 값만 0으로 둬서 과목 선택과 측정을 막지 않는다.
 * `studySec`은 화면에 쓰이지 않아 손대지 않는다.
 * 하루 기준은 들어올 때 한 번 정하므로 세션 중 05시를 지나도 그대로이고, 다음 세션부터 새 날이다.
 */
export async function loadSessionSubjects(
  userId: number,
  now = new Date(),
): Promise<SubjectResponse[]> {
  const dateKey = plannerDateKeyOf(now);
  const nextKey = addDaysToDateKey(dateKey, 1);
  const [subjects, day, next] = await Promise.all([
    listSubjects(),
    fetchDay(userId, dateKey),
    // 아직 오지 않은 날짜는 기록이 있을 수 없어 조회하지 않는다.
    nextKey > kstDateKey(now) ? EMPTY_STATS : fetchDay(userId, nextKey),
  ]);
  const todayFocus = todayFocusBySubject(dateKey, day, next, subjects);
  return subjects.map((subject) => ({ ...subject, focusSec: todayFocus.get(subject.id) ?? 0 }));
}

function fetchDay(userId: number, dateKey: string): Promise<StudySessionListResponse | null> {
  // 실패하면 0으로 가므로 재시도로 목록까지 늦추지 않는다.
  return queryClient
    .fetchQuery({ ...dailyStatsQuery(userId, dateKey), retry: false })
    .catch(() => null);
}

/**
 * 과목 id → 오늘 순공
 *
 * 조회가 실패했거나 응답이 세션 목록 모양이 아니면(프록시 오류 페이지 등) 빈 맵을 돌려줘 전부 0이 된다.
 * 조립 중에 throw하면 과목 목록까지 죽으므로 오늘 값만 포기한다.
 * 조회 실패는 다음 세션에 다시 받아 복구되므로 보고하지 않고, 조립 실패는 응답 형식이 어긋났다는 신호라 보고한다.
 */
function todayFocusBySubject(
  dateKey: string,
  day: StudySessionListResponse | null,
  next: StudySessionListResponse | null,
  subjects: readonly SubjectResponse[],
): ReadonlyMap<number, number> {
  if (day === null || next === null) {
    return new Map();
  }
  try {
    return new Map(
      plannerSubjectItems(assemblePlannerDay(dateKey, day, next), subjects).map((item) => [
        item.subjectId,
        item.focusSec,
      ]),
    );
  } catch (error) {
    reportHandled(error, "session-subject-today");
    return new Map();
  }
}
