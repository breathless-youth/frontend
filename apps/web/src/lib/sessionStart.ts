import {
  isNativeBridgeAvailable,
  postToNative,
} from "@/features/study-session/bridge/nativeBridge";

/**
 * "세션을 시작한다"를 두 환경에 맞게 갈라 주는 어댑터 (BY-334).
 *
 * - **네이티브 웹뷰 안**: `start-session`을 보내고 끝낸다. 카메라 권한 게이트와 세션 화면
 *   push는 네이티브 소유다(ADR-0003) — 웹이 스스로 `/room/:id`로 이동하면 권한 없이 세션
 *   화면이 떠 `getUserMedia`가 실패하고, 화면 스택도 네이티브가 모르는 상태가 된다.
 * - **브라우저 단독 모드**: 브리지가 없으므로 웹이 직접 세션 라우트로 이동한다. 권한은
 *   브라우저가 `getUserMedia` 시점에 스스로 묻는다.
 *
 * ⚠️ 네이티브 쪽 `start-session` 수신은 아직 없다(BY-333 범위) — 그때까지 웹뷰에서는 발신만
 * 되고 아무 일도 일어나지 않는다. 의도된 과도기 상태다(BY-334 티켓 "연관" 참고).
 */
export function requestSessionStart(navigateToSession: () => void): void {
  if (isNativeBridgeAvailable()) {
    postToNative({ type: "start-session", atMs: Date.now() });
    return;
  }
  navigateToSession();
}
