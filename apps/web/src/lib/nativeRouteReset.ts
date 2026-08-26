import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { subscribeToNativeMessages } from "./bridge";

/**
 * 네이티브가 보내는 `reset-route`를 받아 탭 루트로 되돌린다 — `App`에서 한 번만 마운트한다.
 *
 * Android에서 시스템 뒤로가기로 탭을 떠나면 이 웹뷰는 히스토리를 유지한 채 남아, 재진입 시
 * 이전 하위 페이지가 보인다. 네이티브는 떠나는 순간을 알고 웹만 라우터를 움직일 수 있어
 * 신호와 실행이 갈린다(`set-tab-bar`의 역방향과 같은 구도).
 *
 * `replace`로 이동한다 — 초기화가 히스토리에 새 층을 쌓으면 다음 초기화가 되돌릴 층만 는다.
 * 쿼리는 현재 값을 승계한다(`userId` 등 셸 계약 파라미터 유지). 브라우저 단독 모드에서는
 * 메시지가 오지 않아 무동작이다.
 */
export function useNativeRouteReset(): void {
  const navigate = useNavigate();
  // 구독은 마운트 1회만 걸고 최신 쿼리는 ref로 읽는다 — search가 바뀔 때마다 구독을 다시
  // 만들면 그 사이에 도착한 메시지를 놓칠 수 있다.
  const { search } = useLocation();
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    return subscribeToNativeMessages((message) => {
      if (message.type !== "reset-route") {
        return;
      }
      void navigate({ pathname: message.path, search: searchRef.current }, { replace: true });
    });
  }, [navigate]);
}
