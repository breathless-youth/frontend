import { useEffect } from "react";

import { subscribeToNativeMessages } from "./bridge";
import { queryClient } from "./queryClient";
import { statsKeys } from "./statsQueries";

/**
 * 세션 모달이 닫혔다는 네이티브 신호를 받아 통계 쿼리를 낡은 것으로 표시한다.
 *
 * 세션은 별도 웹뷰 문서라 이 문서의 캐시를 직접 무효화하지 못하고, 재노출 신호는 제출
 * 직전에도 와서 그 뒤 모달 닫힘 재노출이 staleTime 안에 억제될 수 있다(실기기 로그로 확인).
 * 그래서 네이티브가 모달을 닫는 순간을 그대로 받아 무효화한다.
 */
export function useNativeSessionClosed(): void {
  useEffect(() => {
    return subscribeToNativeMessages((message) => {
      if (message.type === "session-closed") {
        void queryClient.invalidateQueries({ queryKey: statsKeys.all });
      }
    });
  }, []);
}
