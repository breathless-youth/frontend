import type { StudySessionResponse } from "@focusmakers/types";

import { SUB_MINUTE_SEC } from "@/features/study-session/formatDuration";
import type { SessionEndReason } from "@/features/study-session/sessionState";

export type LiveRoomDoneNavigation =
  { to: "result"; sessions: StudySessionResponse[] } | { to: "social" };

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
    !expired && endReason?.kind === "MANUAL" && focusSec >= SUB_MINUTE_SEC && sessions.length > 0;
  return showResult ? { to: "result", sessions } : { to: "social" };
}
