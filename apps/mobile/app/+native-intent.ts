import { routeFromPushLink } from "../lib/pushNotificationRouting";
import { offerRouteToSession } from "../lib/sessionInvite";

/**
 * 시스템 링크 진입 전처리
 *
 * expo-router는 링크를 라우팅하기 전에 이 함수를 거치고, 빈 값을 돌려받으면 화면을 이동하지 않는다.
 * 세션 화면이 열려 있을 때 초대 링크가 평소대로 화면을 쌓으면 세션 위에 시트로 뜨므로, 여기서 멈추고 초대만 세션 화면에 넘긴다.
 * 콜드 스타트 링크는 세션이 열려 있을 수 없어 그대로 보낸다.
 * 이 함수에서 예외가 나면 앱이 죽을 수 있어 실패하면 받은 경로를 그대로 돌려준다.
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null {
  if (initial) return path;
  try {
    const route = routeFromPushLink(path);
    if (route !== null && offerRouteToSession(route)) return null;
  } catch (error) {
    console.warn("[native-intent] 초대 링크 확인 실패", error);
  }
  return path;
}
