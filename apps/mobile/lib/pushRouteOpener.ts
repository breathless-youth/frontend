import { type PushTarget, pushTargetForRoute } from "./pushNotificationRouting";
import { offerRouteToSession } from "./sessionInvite";
import { runAfterSession } from "./sessionPresence";

/**
 * 알림 탭으로 받은 경로 열기
 *
 * 세션 중 초대 링크는 세션 화면에 시트로 넘기고 화면을 쌓지 않는다.
 * 그 밖의 경로는 세션 화면이 닫힌 뒤에 담당 탭으로 이동한다(세션 위에 탭을 띄워 측정이 꼬이지 않게).
 */
export function openPushRoute(
  route: string,
  push: (target: PushTarget) => void,
  now: () => number = Date.now,
): void {
  if (offerRouteToSession(route)) return;
  runAfterSession(() => push(pushTargetForRoute(route, now())));
}
