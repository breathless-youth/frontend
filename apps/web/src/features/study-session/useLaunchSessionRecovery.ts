import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { SessionRecoveryResponse } from "@focusmakers/types";

import { trackSessionRecoveryPrompted } from "@/lib/amplitude";
import { postToNative, subscribeToNativeMessages } from "@/lib/bridge";
import { statsKeys } from "@/lib/statsQueries";

import { closeStaleSession } from "./closeStaleSession";

/**
 * 앱을 새로 켰을 때 서버에 남아 있는 미확정 세션을 기록으로 확정한다.
 *
 * 강제 종료 뒤에는 집중 시작을 누르기 전까지 아무도 그 세션을 치우지 않아, 기록 탭을 먼저 연
 * 사용자는 직전 공부가 사라진 것으로 본다. 서버가 일정시간 뒤 자동으로 확정하지만 그때까지의 공백을 메운다.
 *
 * 신호는 네이티브만 보낼 수 있다.
 * 확정한 기록은 recovered로 내주고 홈이 안내 모달을 채운다.
 */
export function useLaunchSessionRecovery(userId: number | null): {
  recovered: SessionRecoveryResponse | null;
  dismiss: () => void;
} {
  const queryClient = useQueryClient();
  const [recovered, setRecovered] = useState<SessionRecoveryResponse | null>(null);

  useEffect(() => {
    if (userId === null) {
      return;
    }
    // 사용자가 바뀌면 이전 사용자의 결과를 들고 있으면 안 된다. 진행 중이던 마감이 화면
    // 전환보다 늦게 끝나도 낡은 콜백이 남의 기록을 올리지 못하게 취소 플래그로 버린다.
    let cancelled = false;
    setRecovered(null);
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type !== "app-launched") {
        return;
      }
      void closeStaleSession(userId).then((result) => {
        if (cancelled) {
          return;
        }
        // 마감으로 오늘 집계와 연속일이 달라진다. 홈을 벗어나지 않고 갱신해야 해서 직접 무효화한다.
        void queryClient.invalidateQueries({ queryKey: statsKeys.all });
        if (result !== null && result.focusSec >= 60) {
          trackSessionRecoveryPrompted(result.focusSec);
          setRecovered(result);
        }
      });
    });
    // 구독을 건 다음에 보낸다.
    // 네이티브는 이 신호를 받은 순간에만 응답하므로 순서가 바뀌면 응답을 놓친다.
    // 로드 콜백 대신 이 handshake를 쓰는 이유는 네이티브 쪽 주석에 있다 —
    // Android는 로드가 실패해도 onLoad를 불러 줘서 로드 이벤트로는 발신 시점을 정할 수 없다.
    postToNative({ type: "home-ready", atMs: Date.now() });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [queryClient, userId]);

  const dismiss = useCallback(() => {
    setRecovered(null);
  }, []);

  return { recovered, dismiss };
}
