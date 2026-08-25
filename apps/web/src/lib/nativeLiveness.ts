import { useEffect } from "react";

import { postToNative, subscribeToNativeMessages } from "./bridge";

/**
 * 네이티브의 웹뷰 생존 확인(`ping`)에 즉답한다(BY-436). `App`에서 한 번만 마운트한다.
 *
 * OS가 백그라운드에서 렌더러 프로세스를 회수하면 네이티브의 사후 통보가 늦거나 오지 않아
 * 순백 화면이 노출된다 — 그래서 네이티브가 포그라운드 복귀마다 ping을 보내고, 정해진 시간
 * 안에 pong이 없으면 죽은 것으로 보고 재로드한다. **여기가 응답하지 못하면 살아 있는
 * 웹뷰도 재로드되어 진행 중 측정이 날아가므로, 이 훅은 어떤 화면에서도 내려가면 안 된다.**
 *
 * 브라우저 단독 모드에서는 ping이 애초에 오지 않고 `postToNative`도 무동작이라 안전하다.
 */
export function useNativePingResponder(): void {
  useEffect(
    () =>
      subscribeToNativeMessages((message) => {
        if (message.type === "ping") {
          postToNative({ type: "pong", id: message.id, atMs: Date.now() });
        }
      }),
    [],
  );
}
