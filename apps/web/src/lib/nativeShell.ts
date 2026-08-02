import { useEffect } from "react";

import { isNativeBridgeAvailable } from "./bridge";

/**
 * 네이티브 셸(웹뷰) 안에서 실행 중임을 문서 루트에 표시한다 — `index.css`의 `.native-shell`
 * 규칙이 이 클래스에 걸린다(페이지 전체 드래그·길게 눌러 선택 방지).
 *
 * ## 왜 전역 CSS가 아니라 클래스인가
 *
 * `apps/web`은 독립 브라우저 서비스로도 배포된다(ADR 0001). 브라우저에서 텍스트 선택·복사를
 * 막으면 이용약관·개인정보처리방침을 읽는 사용자에게 그냥 불편일 뿐이다 — 앱처럼 보이게 하려는
 * 조치는 **앱 안에서만** 건다.
 *
 * 브리지 존재 여부는 실행 중에 바뀌지 않으므로 한 번만 판정한다. 세션 화면의
 * `.session-no-drag`는 그대로 남는다 — 그쪽은 브라우저 단독 모드에서도 카메라 위 오버레이가
 * 끌리면 안 되는, 화면 고유의 요구다.
 */
export function useNativeShellClass(): void {
  useEffect(() => {
    if (!isNativeBridgeAvailable()) {
      return;
    }
    const root = document.documentElement;
    root.classList.add("native-shell");
    return () => {
      root.classList.remove("native-shell");
    };
  }, []);
}
