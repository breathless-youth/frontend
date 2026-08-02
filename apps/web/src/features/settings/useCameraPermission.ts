import { useEffect, useState } from "react";

import { isNativeBridgeAvailable, postToNative, subscribeToNativeMessages } from "@/lib/bridge";

/**
 * OS 카메라 권한 허용 여부 — 설정(S6)의 권한 행 토글이 쓴다.
 *
 * 웹은 이 값을 스스로 알 수 없다. `navigator.permissions.query({ name: "camera" })`는
 * iOS WKWebView가 지원하지 않아 앱 안에서 플랫폼별로 갈리므로, 네이티브에 물어보는 브리지
 * 왕복(`request-camera-permission` → `camera-permission`)으로 받는다.
 *
 * ## `null`이 정상 상태다
 *
 * 브라우저 단독 모드(브리지 없음)와 조회 실패에서는 영영 `null`이고, 그때 화면은 토글 자리를
 * **비운다**(RN 원본의 `granted === null` 분기와 같은 모양). 모르는 값을 `false`로 접으면
 * 화면이 "허용 안 됨"이라고 틀린 단언을 하게 된다 — 실제로는 허용돼 있을 수 있다.
 *
 * ## 왜 `visibilitychange`인가
 *
 * 권한은 **이 화면 밖에서** 바뀐다. 사용자가 권한 행을 눌러 OS 설정으로 나갔다가 돌아오는
 * 것이 유일한 변경 경로이므로, 한 번 받아 둔 값은 그 왕복 뒤에 반드시 낡는다. 복귀 시점은
 * 웹뷰 재노출 = `visibilitychange`로 알 수 있어, 네이티브에 앱 생명주기 배선을 새로 넣지 않고
 * 웹 안에서 닫힌다(react-query의 `refetchOnWindowFocus`가 이미 같은 신호를 쓰고 있다).
 */
export function useCameraPermission(): boolean | null {
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    // 브라우저 단독 모드에서는 물어볼 상대가 없다 — 리스너도 달지 않고 `null`로 남긴다.
    if (!isNativeBridgeAvailable()) {
      return;
    }

    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type === "camera-permission") {
        setGranted(message.granted);
      }
    });

    const request = () => {
      postToNative({ type: "request-camera-permission", atMs: Date.now() });
    };
    const requestWhenVisible = () => {
      // 숨겨질 때는 묻지 않는다 — 답이 와도 화면에 반영될 일이 없고, 백그라운드에서 깨어난
      // 웹뷰가 네이티브에 말을 거는 경로를 만들 이유도 없다.
      if (document.visibilityState === "visible") {
        request();
      }
    };

    request();
    document.addEventListener("visibilitychange", requestWhenVisible);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", requestWhenVisible);
    };
  }, []);

  return granted;
}
