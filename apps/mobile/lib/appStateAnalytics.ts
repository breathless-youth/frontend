import type { AppStateStatus } from "react-native";

import { trackNativeEvent } from "./nativeAnalytics";

/**
 * 앱 포/백그라운드 전환을 사용자 이벤트로 남긴다(`app_backgrounded` / `app_foregrounded`).
 *
 * 웹이 각자 `visibilitychange`로 찍으면 탭 웹뷰 수만큼 중복되고(#97의 `app-state` 릴레이가 예고한
 * 문제), 네이티브 `app-state` 브리지 메시지는 발신자가 없어 한 번도 나간 적이 없다. 그래서 여기서
 * 한 번 판정해 단일 sink 큐(`lib/nativeAnalytics.ts`)로 넘긴다 — 백그라운드에서 웹뷰 JS가 멈춰
 * 있어도 `atMs`가 실제 시각을 갖고 가므로 복귀 뒤 전송돼도 타임라인이 맞다.
 *
 * - `background`만 "떠남"으로 센다. iOS의 `inactive`(제어 센터·전화 수신·앱 전환기)는 돌아올지
 *   모르는 상태라 세지 않는다 — `inactive` → `active`는 이벤트 없이 지나간다.
 * - 앱 시작 직후의 첫 `active`는 복귀가 아니라 세지 않는다(백그라운드 기록이 없으면 무시).
 * - `background_sec`는 떠나 있던 시간이다. 시계가 뒤로 조정돼도 음수는 내지 않는다.
 *
 * 순수 함수라 `app/_layout.tsx`가 `AppState.addEventListener("change", ...)`에 그대로 건다.
 */
export function createAppStateTracker(
  now: () => number = Date.now,
): (state: AppStateStatus) => void {
  let backgroundSinceMs: number | null = null;
  return (state) => {
    if (state === "background") {
      if (backgroundSinceMs === null) {
        backgroundSinceMs = now();
        trackNativeEvent("app_backgrounded");
      }
      return;
    }
    if (state === "active" && backgroundSinceMs !== null) {
      const backgroundSec = Math.max(0, Math.round((now() - backgroundSinceMs) / 1000));
      backgroundSinceMs = null;
      trackNativeEvent("app_foregrounded", { background_sec: backgroundSec });
    }
  };
}
