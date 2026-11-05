import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { postToNative, subscribeToNativeMessages } from "./bridge";
import { showNotificationToast } from "./toast";

/**
 * 세션 경로인지
 *
 * 싱글룸, 소셜룸, 그룹 공부방과 그 결과 화면이다.
 * 결과 화면도 방금 끝낸 세션의 흐름이라 알림 토스트로 끊지 않는다.
 * `lib/nativeScreenReport.ts`의 어두운 화면 목록과 겹치지만 그쪽은 결과 화면을 빼야 해서 따로 둔다.
 */
export function isSessionRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/room/") ||
    pathname.startsWith("/social/room/") ||
    /^\/social\/groups\/[^/]+\/room(?:\/|$)/.test(pathname)
  );
}

/**
 * 앱을 쓰는 중에 온 그룹 알림을 토스트로 보이는 훅
 *
 * `App`에서 한 번만 쓴다.
 * 앱도 세션 화면이면 보내지 않지만 세션 화면 위의 토스트는 측정과 공부를 방해해서 웹도 세션 경로에서 한 번 더 거른다.
 * 누르면 앱이 알림을 누른 것과 같은 허용 규칙과 이동 경로로 연다.
 * `open-push-link`는 `in-app-notification`을 받은 문서에서만 보내므로 이 메시지를 모르는 옛 바이너리에는 가지 않는다.
 * 앱은 웹이 `analytics-ready`를 보낸 문서에만 알림을 보내므로 이 구독은 그 신호보다 먼저 건다.
 */
export function useInAppNotificationRelay(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    return subscribeToNativeMessages((message) => {
      if (message.type !== "in-app-notification" || isSessionRoute(pathname)) {
        return;
      }
      const { title, body, link, pushType } = message;
      showNotificationToast({
        title,
        body,
        onOpen: () => {
          postToNative({
            type: "open-push-link",
            link,
            ...(pushType !== undefined ? { pushType } : {}),
            atMs: Date.now(),
          });
        },
      });
    });
  }, [pathname]);
}
