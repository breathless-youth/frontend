import type { LiveActivitySnapshot } from "@focusmakers/types";

import { isBreak, type SessionState } from "./sessionState";
import type { StudyRoomPhase } from "./useStudyRoomSession";

export type LiveActivityInput = {
  measureMode: "timer" | "camera";
  subject: string | null;
  sessionState: SessionState;
  phaseName: StudyRoomPhase["name"];
  focusSec: number;
};

/**
 * 잠금화면 공부 표시로 넘길 세션 스냅샷
 *
 * 공부 중이 아니면 null이라 네이티브가 표시를 끝낸다.
 * 딴짓 상태는 세션이 이어지지만 화면 숫자가 멈추므로 따로 보내 잠금화면 시계도 멈추게 한다.
 */
export function toLiveActivitySnapshot(input: LiveActivityInput): LiveActivitySnapshot | null {
  if (input.phaseName !== "studying") {
    return null;
  }
  let state: LiveActivitySnapshot["state"] = "running";
  if (isBreak(input.sessionState)) {
    state = "break";
  } else if (input.sessionState.kind === "PAUSE") {
    state = "paused";
  } else if (input.sessionState.kind === "DISTRACTION") {
    state = "distracted";
  }
  return {
    mode: input.measureMode,
    subject: input.subject,
    state,
    elapsedSec: Math.floor(input.focusSec),
  };
}
