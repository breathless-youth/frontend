import { useEffect } from "react";

import { trackNativeShellEvent } from "./amplitude";
import { postToNative, subscribeToNativeMessages } from "./bridge";

/**
 * 네이티브가 보내는 사용자 이벤트(`track-event`)를 받아 Amplitude로 넘긴다 — `App`에서 한 번만
 * 마운트한다.
 *
 * 하단 탭 터치·카메라 권한 게이트 결과·권한 거부 안내(S2-3)의 행동처럼 웹뷰 밖에서 일어나는
 * 일은 웹이 알 수 없고, 분석 SDK는 웹에만 있다 — 그래서 네이티브가 관측하고 웹이 전송한다
 * (`set-tab-bar`의 역방향 구도). 이벤트 카탈로그는 발신자인 `apps/mobile/lib/nativeAnalytics.ts`가
 * 소유하고, 여기서는 이름을 해석하지 않는다(형식 검증은 `parseToWebMessage`가 한다).
 *
 * **구독을 건 뒤에 `analytics-ready`를 보낸다.** 네이티브는 이 신호를 받은 문서에만 주입하고 그
 * 전까지는 큐에 쌓아 두므로, 순서가 바뀌면 큐가 비워지는 사이 도착한 이벤트가 구독자 없이
 * 버려진다. 문서가 새로 로드될 때마다(재로드·렌더러 복구·`/contact` 문서 내비게이션) 이 훅이
 * 다시 마운트되어 신호도 다시 나간다.
 *
 * 브라우저 단독 모드에서는 메시지가 오지 않고 `postToNative`도 무동작이라 안전하다.
 */
export function useNativeAnalyticsRelay(): void {
  useEffect(() => {
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type === "track-event") {
        trackNativeShellEvent(message);
      }
    });
    postToNative({ type: "analytics-ready", atMs: Date.now() });
    return unsubscribe;
  }, []);
}
