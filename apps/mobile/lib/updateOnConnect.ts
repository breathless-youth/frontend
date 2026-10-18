import type { AppStateStatus } from "react-native";

import { type ConnectTrigger, type ForceUpdateDecision, refreshForceUpdate } from "./forceUpdate";
import { runAfterSession } from "./sessionPresence";

/**
 * 긴 백그라운드 뒤 복귀를 접속으로 치는 기준
 *
 * 콘솔에서 게시한 값이 다음 접속에 걸리게 하되, 앱을 쓰는 도중에는 끼어들지 않으려고 30분으로 정했다.
 * 앱을 새로 켤 때의 판정은 `resolveForceUpdateOnLaunch`가 맡는다.
 */
export const RECONNECT_AFTER_BACKGROUND_MS = 30 * 60_000;

/**
 * 접속 때의 재판정
 *
 * 서버 값을 새로 받아 판정하고, 세션 화면이 떠 있으면 닫힌 뒤에 `apply`에 넘긴다.
 * throw하지 않는다.
 */
export function checkUpdateOnConnect(
  trigger: ConnectTrigger,
  apply: (decision: ForceUpdateDecision) => void,
): Promise<void> {
  return refreshForceUpdate(trigger).then((decision) => {
    runAfterSession(() => apply(decision));
  });
}

/**
 * 긴 백그라운드 뒤 복귀 감지
 *
 * iOS의 `inactive`는 제어 센터·전화 수신처럼 돌아올지 모르는 상태라 백그라운드로 세지 않는다.
 * 시계가 뒤로 조정돼 떠나 있던 시간이 음수면 복귀로 치지 않는다.
 */
export function createReconnectListener(
  onReconnect: () => void,
  now: () => number = Date.now,
): (state: AppStateStatus) => void {
  let backgroundSinceMs: number | null = null;
  return (state) => {
    if (state === "background") {
      backgroundSinceMs ??= now();
      return;
    }
    if (state !== "active" || backgroundSinceMs === null) return;
    const awayMs = now() - backgroundSinceMs;
    backgroundSinceMs = null;
    if (awayMs >= RECONNECT_AFTER_BACKGROUND_MS) onReconnect();
  };
}
