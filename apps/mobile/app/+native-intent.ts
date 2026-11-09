import { isAirbridgeLink } from "../lib/airbridge";
import { routeFromPushLink } from "../lib/pushNotificationRouting";
import { offerRouteToSession } from "../lib/sessionInvite";

// 카카오(kakao{앱 키}://)와 구글(역순 클라이언트 ID) 로그인 SDK가 앱으로 돌아올 때 쓰는 주소다.
// SDK가 AppDelegate에서 먼저 처리하므로 라우터가 이동하면 없는 화면(Unmatched Route)이 뜬다.
const SOCIAL_LOGIN_RETURN = /^(kakao[0-9a-f]{32}|com\.googleusercontent\.apps\.[\w-]+):/;

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
  if (SOCIAL_LOGIN_RETURN.test(path)) return null;
  // 추적 링크는 SDK가 원래 딥링크로 바꿔 루트 레이아웃의 `onAirbridgeDeepLink`가 연다.
  if (isAirbridgeLink(path)) return null;
  if (initial) return path;
  try {
    const route = routeFromPushLink(path);
    if (route !== null && offerRouteToSession(route)) return null;
  } catch (error) {
    console.warn("[native-intent] 초대 링크 확인 실패", error);
  }
  return path;
}
