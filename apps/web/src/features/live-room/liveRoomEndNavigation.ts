import type { StudySessionResponse } from "@focusmakers/types";

import { MIN_RECORDED_FOCUS_SEC } from "@/features/study-session/formatDuration";
import type { SessionEndReason } from "@/features/study-session/sessionState";
import i18n from "@/lib/i18n";

/** `home`은 공부방을 연 홈이고, 초대코드 방은 소셜 홈, 그룹 공부방은 그 그룹의 그룹 홈이다. */
export type LiveRoomDoneNavigation =
  { to: "result"; sessions: StudySessionResponse[] } | { to: "home" };

// 결과 화면은 싱글룸과 같은 조건에서만 뜬다.
// 유예 만료는 수동 종료로 잡혀도 안내가 먼저라 결과를 건너뛴다
// — 같은 복귀 이벤트에서 20분 감시자(일시정지 후 20분)가 강제로 종료시킬 수 있다.
export function resolveLiveRoomDoneNavigation(input: {
  expired: boolean;
  endReason: SessionEndReason | null;
  focusSec: number;
  sessions: StudySessionResponse[];
}): LiveRoomDoneNavigation {
  const { expired, endReason, focusSec, sessions } = input;
  const showResult =
    !expired &&
    endReason?.kind === "MANUAL" &&
    focusSec >= MIN_RECORDED_FOCUS_SEC &&
    sessions.length > 0;
  return showResult ? { to: "result", sessions } : { to: "home" };
}

/** 그룹장이 공부방에서 나를 내보냈을 때 그룹 탭에 남기는 안내 */
export function kickedNotice(groupName: string | null): string {
  return groupName
    ? i18n.t("live-room:notice.kicked", { groupName })
    : i18n.t("live-room:notice.kickedUnnamed");
}
