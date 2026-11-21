import type { HomeLoadState, HomeTodayStats } from "@/features/home-v3/homeV3ContentTypes";
import { focusRatePercent } from "@/features/timelapse/timelapseFrame";

/**
 * 오늘 기록에 이번 세션을 더한 공부시간
 *
 * 서버의 오늘 기록에는 아직 저장하지 않은 이번 세션이 없어서 화면에서 더한다.
 * 집중률은 더한 두 시간으로 다시 계산한다.
 * ponytail: 공부 중에 기록의 하루가 바뀌어도 앞 날짜 기록에 계속 더하고, 맞추려면 이번 세션을 하루 경계에서 나눠 더한다.
 */
export function addSessionToToday(
  stats: HomeLoadState<HomeTodayStats>,
  session: { studySec: number; focusSec: number },
): HomeLoadState<HomeTodayStats> {
  if (stats.status !== "success") return stats;
  const studySeconds = stats.value.studySeconds + session.studySec;
  const focusSeconds = stats.value.focusSeconds + session.focusSec;
  return {
    status: "success",
    value: { studySeconds, focusSeconds, focusRate: focusRatePercent(studySeconds, focusSeconds) },
  };
}
