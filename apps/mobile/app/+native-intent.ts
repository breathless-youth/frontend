import { router } from "expo-router";

import { pushTargetForRoute, routeFromPushLink } from "../lib/pushNotificationRouting";
import { offerRouteToSession } from "../lib/sessionInvite";
import {
  isSettingsTabTarget,
  markSettingsAsInitialRoute,
  revealSettingsTab,
  settingsMayBeHidden,
} from "../lib/settingsReveal";

/**
 * 시스템 링크 진입 전처리
 *
 * expo-router는 링크를 라우팅하기 전에 이 함수를 거치고, 빈 값을 돌려받으면 화면을 이동하지 않는다.
 * 세션 화면이 열려 있을 때 초대 링크가 평소대로 화면을 쌓으면 세션 위에 시트로 뜨므로, 여기서 멈추고 초대만 세션 화면에 넘긴다.
 * 콜드 스타트 링크는 세션이 열려 있을 수 없어 그대로 보낸다.
 * 설정 탭이 여는 웹 경로(프로필 등)는 그 경로로 된 화면이 없어, 알림과 같은 표로 설정 탭 대상으로 바꿔 연다.
 * 콜드 스타트 설정 링크는 탭 레이아웃이 아직 없어 멈출 수 없으므로, 레이아웃이 설정에서 시작하도록 표시만 남긴다.
 * 설정 링크는 설정 탭이 숨어 있으면 라우트가 없어 이동하지 못하므로, 여기서 멈추고 탭 레이아웃이 칸을 되살린 뒤 연다.
 * 이 함수에서 예외가 나면 앱이 죽을 수 있어 실패하면 받은 경로를 그대로 돌려준다.
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null {
  try {
    const route = routeFromPushLink(path);
    const target = route === null ? null : pushTargetForRoute(route);
    const settingsTarget = target !== null && isSettingsTabTarget(target) ? target : null;
    if (initial) {
      if (settingsTarget === null) return path;
      markSettingsAsInitialRoute();
      if (typeof settingsTarget === "string") return path;
      // 객체 대상은 문자열로만 돌려줄 수 있다. 라우터가 객체 href를 문자열로 만들 때처럼 path를 한 번 더 인코딩해야 탭에 원래 경로로 도착한다.
      return `/settings?path=${encodeURIComponent(settingsTarget.params.path)}&at=${settingsTarget.params.at}`;
    }
    if (route !== null && offerRouteToSession(route)) return null;
    // 설정 칸이 보이고 경로가 그대로 설정 라우트면 받은 경로로 충분하다.
    const needsTarget = typeof settingsTarget !== "string" || settingsMayBeHidden();
    if (settingsTarget !== null && needsTarget) {
      // 라우팅 직전이라 이동은 한 틱 미뤄 이 링크 처리가 끝난 뒤에 한다.
      revealSettingsTab(() => queueMicrotask(() => router.navigate(settingsTarget)));
      return null;
    }
  } catch (error) {
    console.warn("[native-intent] 초대 링크 확인 실패", error);
  }
  return path;
}
