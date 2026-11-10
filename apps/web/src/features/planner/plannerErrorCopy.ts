import { ApiError } from "@/lib/api";
import i18n from "@/lib/i18n";

/**
 * 플래너 저장 실패를 사용자가 이해할 문구로 바꾸는 함수
 *
 * 서버 메시지는 한국어라서 화면에 그대로 내지 않고 code로만 고른다.
 * 다시 해도 같은 결과인 거절은 이유를 보여 줘야 고장으로 오해하지 않는다.
 * 404는 과목이 없을 때도 오므로 할 일을 대상으로 한 요청에서만 지워진 할 일로 읽는다.
 */
export function plannerErrorCopy(
  error: unknown,
  { fallback, taskTarget = false }: { fallback?: string; taskTarget?: boolean } = {},
): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "PLANNER_DUPLICATE_OCCURRENCE":
        return i18n.t("planner:rejected.duplicateOccurrence");
      case "PLANNER_TASK_LIMIT":
        return i18n.t("planner:plan.taskLimit");
      case "PLANNER_CARRYOVER_CHANGED":
        return i18n.t("planner:rejected.carryoverChanged");
      case "PLANNER_PAST_DAY":
        return i18n.t("planner:rejected.pastDay");
    }
    if (taskTarget && error.status === 404) return i18n.t("planner:rejected.taskGone");
  }
  return fallback ?? i18n.t("common:errors.retryLater");
}
