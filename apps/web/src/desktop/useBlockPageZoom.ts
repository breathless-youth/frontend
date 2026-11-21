import { useEffect } from "react";

const ZOOM_KEYS = new Set(["+", "=", "-", "_", "0"]);

/**
 * 키보드 단축키와 핀치로 페이지를 확대·축소하지 않게 막는 훅
 *
 * 월페이퍼와 끌어 옮기는 창이 상자 안 고정 배치라 실수로 확대되면 화면이 어긋나 보인다.
 * 트랙패드 핀치는 Chrome·Edge·Firefox에서 ctrlKey가 켜진 휠로, Safari에서 gesture 이벤트로 온다.
 * 브라우저 메뉴나 설정에서 바꾼 배율은 웹에서 막을 수 없고 막지도 않는다.
 */
export function useBlockPageZoom() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && ZOOM_KEYS.has(event.key)) {
        event.preventDefault();
      }
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    const onGesture = (event: Event) => event.preventDefault();
    window.addEventListener("keydown", onKeyDown);
    // passive로 걸면 브라우저가 preventDefault를 무시한다.
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("gesturestart", onGesture);
    window.addEventListener("gesturechange", onGesture);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("gesturestart", onGesture);
      window.removeEventListener("gesturechange", onGesture);
    };
  }, []);
}
