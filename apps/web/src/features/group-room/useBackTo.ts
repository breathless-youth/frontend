import { useLocation, useNavigate } from "react-router-dom";

import { slideNavigate } from "@/lib/pageTransition";

import { baseSearch } from "./groupTabSearch";

/**
 * 그룹 화면의 뒤로 가기
 *
 * 앱 안에서 온 화면이면 앞 화면으로 돌아가고, 푸시나 링크로 바로 열려 앞 화면이 없으면 정한 화면으로 바꿔 간다.
 */
export function useBackTo(fallbackPath: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
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
