import { closeStaleSession } from "@/features/study-session/closeStaleSession";
import { isNativeBridgeAvailable, postToNative } from "@/lib/bridge";

/** `requestSessionStart`가 실제로 어느 경로를 탔는지 — 호출부가 후속 히스토리 조작을 정하는 데 쓴다. */
export type SessionStartRoute = "native" | "web";

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
 *
 * **반환값은 호출부의 히스토리 조작 판단에 쓰인다**(재리뷰 반영). `"native"`일 때는
 * `navigateToSession`이 호출되지 않으므로 화면 전환이 전혀 일어나지 않는다 — 네이티브가 화면
 * 스택을 소유해 웹 쪽에서 별도로 push/replace할 대상이 없기 때문이다. 그래서 가이드처럼 "닫기"가
 * 필요한 화면은 이 값이 `"native"`일 때만 스스로 닫아야 한다(그래야 갇히지 않으면서도 조작이
 * 정확히 한 번으로 유지된다). `isNativeBridgeAvailable()`을 호출부에서 다시 검사하지 말 것 —
 * 판단이 두 곳으로 갈라진다.
 */
export async function requestSessionStart(
  userId: number | null,
  navigateToSession: () => void,
): Promise<SessionStartRoute> {
  // 서버에 남은 옛 세션을 먼저 치운 뒤에 화면을 넘긴다. 순서가 뒤집히면 세션 화면의 복구
  // 조회가 옛 세션을 돌려줘, 사용자가 새로 시작하려던 자리에 지난 공부시간이 찍힌다.
  // 웹뷰에서는 네이티브가 start-session을 받고서야 세션 웹뷰를 만들므로 이 순서가 곧 요청 순서다.
  await closeStaleSession(userId);
  if (isNativeBridgeAvailable()) {
    postToNative({ type: "start-session", atMs: Date.now() });
    return "native";
  }
  navigateToSession();
  return "web";
}
