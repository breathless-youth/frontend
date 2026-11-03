import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { slideNavigate } from "@/lib/pageTransition";

import { baseSearch } from "./groupTabSearch";

/**
 * 그룹 화면의 뒤로 가기
 *
 * 앱 안에서 온 화면이면 앞 화면으로 돌아가고, 푸시나 링크로 바로 열려 앞 화면이 없으면 정한 화면으로 바꿔 간다.
 * 앞 화면으로 돌아가기는 부를 때마다 한 칸씩 돌아가서, 보낸 결과와 다시 받은 조회가 함께 부르면 두 칸을 돌아간다.
 * 그래서 한 주소에서는 처음 한 번만 이동하고, 같은 화면이 다른 주소에 남으면 다시 이동할 수 있다.
 */
export function useBackTo(fallbackPath: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const leftKey = useRef<string | null>(null);
  return () => {
    if (leftKey.current === location.key) {
      return;
    }
    leftKey.current = location.key;
    slideNavigate("back", () => {
      const historyState = window.history.state as { idx?: number } | null;
      if (historyState?.idx) {
        navigate(-1);
        return;
      }
      navigate({ pathname: fallbackPath, search: baseSearch(location.search) }, { replace: true });
    });
  };
}
