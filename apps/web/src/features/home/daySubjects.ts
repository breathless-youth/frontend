import type { SubjectDayResponse, SubjectResponse } from "@focusmakers/types";
import type { QueryClient } from "@tanstack/react-query";

import { liveSubjectsOf, type PlannerDay } from "@/features/planner/plannerDay";
import { plannerSubjectItems, type PlannerSubjectItem } from "@/features/planner/subjectItems";
import { kstDateKey } from "@/features/records/recordsFormat";
import { dailyStatsQuery } from "@/lib/statsQueries";
import { listSubjects } from "@/lib/subjectApi";

/**
 * 지금 과목 목록 받기
 *
 * 오늘의 일간 조회에 실려 오고, 싣지 않는 서버면 과목 목록 API로 대신한다.
 * 할 일은 달력 날짜로 나뉘어, 과목 목록 API와 같은 것을 받으려면 홈의 오늘이 아니라 달력 날짜로 받는다.
 * 홈의 오늘로 받으면 새벽 0~5시에 만든 할 일이 빠진다.
 */
export async function loadLiveSubjects(
  queryClient: QueryClient,
  userId: number,
): Promise<SubjectResponse[]> {
  const today = await queryClient
    .fetchQuery({ ...dailyStatsQuery(userId, kstDateKey()), staleTime: 0 })
    .catch(() => null);
  return (today && liveSubjectsOf(today)) ?? listSubjects();
}

/**
 * 고른 날의 과목 목록
 *
 * 홈 목록과 타임테이블이 같은 과목을 보이도록 한 곳에서 정한다.
 * 오늘이거나 날짜별 과목 조회가 없으면(`dayEntries`가 undefined) 지금 과목을 모두 보인다.
 * 지난 날 목록은 날짜별 과목 조회가 최종으로 정한다.
 */
export function daySubjectItems(
  day: PlannerDay,
  liveSubjects: readonly SubjectResponse[] | null,
  dayEntries: readonly SubjectDayResponse[] | undefined,
  isToday: boolean,
): PlannerSubjectItem[] {
  // 기록과 이름으로 맞추기 전에 걸러야, 그날 없던 같은 이름의 새 과목에 기록이 합쳐지지 않고 지운 과목 줄로 남는다.
  // 지금 목록에 남아 있어도 그날 조회가 지운 과목이라 하면 시간 직접 입력에서 고를 수 없어 지운 과목 줄로 둔다.
  const shownSubjects =
    dayEntries === undefined
      ? liveSubjects
      : (liveSubjects?.filter((live) =>
          dayEntries.some((entry) => entry.id === live.id && !entry.deleted),
        ) ?? null);
  const items = plannerSubjectItems(day, shownSubjects, isToday ? "live" : "completed");
  if (dayEntries === undefined) {
    return items;
  }
  // 그날 조회에 없는 과목은 기록이 있어도 그날 있던 과목이 아니라 뺀다.
  // 기록 줄의 id는 같은 이름 과목의 대표라서 그날 조회의 id로 바꿔야 그날 완료 여부를 읽는다.
  const onDay = items.flatMap((item) => {
    if (item.live) {
      return [item];
    }
    const entry =
      dayEntries.find((candidate) => candidate.id === item.subjectId) ??
      dayEntries.find((candidate) => candidate.name === item.name);
    return entry === undefined ? [] : [{ ...item, subjectId: entry.id }];
  });
  // 그 뒤에 지운 과목은 그날 기록이 없어도 그날 있던 과목이라 0분 줄로 붙인다.
  // 기록은 이름으로 합쳐지므로 같은 이름이 이미 있으면 붙이지 않아야 한 과목이 두 번 보이지 않는다.
  for (const entry of dayEntries) {
    if (entry.deleted && !onDay.some((item) => item.name === entry.name)) {
      onDay.push({
        subjectId: entry.id,
        name: entry.name,
        colorIndex: entry.colorIndex,
        focusSec: 0,
        tasks: [],
        live: false,
      });
    }
  }
  return onDay;
}
