import { type PushTarget, pushTargetForRoute } from "./pushNotificationRouting";
import { offerRouteToSession } from "./sessionInvite";
import { runAfterSession } from "./sessionPresence";

/** 마지막으로 받은 알림의 표. 세션 중에 여러 건이 쌓이면 마지막 것만 연다. */
let latestTicket = 0;

/**
 * 알림 탭으로 받은 경로 열기
 *
 * 세션 중 초대 링크는 세션 화면에 시트로 넘기고 화면을 쌓지 않는다.
 * 그 밖의 경로는 세션 화면이 닫힌 뒤에 담당 탭으로 이동한다(세션 위에 탭을 띄워 측정이 꼬이지 않게).
 * 이동은 마이크로태스크로 한 번 미룬다. 세션이 닫히는 순간의 호출은 언마운트 cleanup 안이라 스택 pop과 겹친다.
 */
export function openPushRoute(
  route: string,
  push: (target: PushTarget) => void,
  now: () => number = Date.now,
): void {
  if (offerRouteToSession(route)) return;
  const ticket = ++latestTicket;
  runAfterSession(() => {
    if (ticket !== latestTicket) return;
    queueMicrotask(() => push(pushTargetForRoute(route, now())));
  });
}
