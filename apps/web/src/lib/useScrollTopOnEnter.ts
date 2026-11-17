import { useLayoutEffect } from "react";
import { useNavigationType } from "react-router-dom";

/**
 * 새로 들어온 화면을 맨 위에서 열기
 *
 * 앱 안 이동은 같은 문서라 창의 스크롤이 앞 화면에서 내린 위치 그대로 남는다.
 * 약관처럼 첫 줄부터 읽어야 하는 화면은 새로 들어올 때 맨 위로 올리고, 뒤로 가기·앞으로 가기로 돌아올 때는 브라우저가 되살린 위치를 건드리지 않는다.
 * 앱 전체가 아니라 이 훅을 부른 화면에만 적용된다.
 */
export function useScrollTopOnEnter(): void {
  const navigationType = useNavigationType();
  useLayoutEffect(() => {
    if (navigationType !== "POP") {
      window.scrollTo(0, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 들어온 순간에 한 번만 본다
  }, []);
}
