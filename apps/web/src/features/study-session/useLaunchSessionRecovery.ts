import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { SessionRecoveryResponse } from "@focusmakers/types";

import { trackSessionRecoveryConfirmed, trackSessionRecoveryPrompted } from "@/lib/amplitude";
import { isNativeBridgeAvailable, postToNative, subscribeToNativeMessages } from "@/lib/bridge";
import { statsKeys } from "@/lib/statsQueries";

import { closeStaleSession } from "./closeStaleSession";
import { markRecoveryShownThisLaunch } from "./recoveryLaunchStore";

/**
 * 앱 실행 신호를 기다리는 시간
 *
 * 셸은 준비 신호를 받은 자리에서 바로 답하고, 한 실행에 한 번만 답한다.
 * 이 안에 오지 않으면 이번 실행의 첫 홈 문서가 아니거나 신호를 보내지 않는 셸이라 복구할 것이 없다.
 */
export const LAUNCH_SIGNAL_WAIT_MS = 1500;

interface RecoveryState {
  userId: number | null;
  result: SessionRecoveryResponse | null;
  /**
   * 이 문서에서 복구 판단이 끝났는지
   *
   * 홈 랭킹 팝업이 이 값을 기다린다.
   */
  settled: boolean;
}

/**
 * 첫 복구 상태
 *
 * 사용자나 셸이 없으면 기다릴 실행 신호가 없어 처음부터 끝난 것으로 둔다.
 */
function initialState(userId: number | null): RecoveryState {
  return { userId, result: null, settled: userId === null || !isNativeBridgeAvailable() };
}

/**
 * 앱 실행 직후 옛 세션 확정
 *
 * 강제 종료 뒤에는 집중 시작을 누르기 전까지 아무도 그 세션을 치우지 않아, 기록 탭을 먼저 연 사용자는 직전 공부가 사라진 것으로 본다.
 * 서버가 일정 시간 뒤 자동으로 확정하지만 그때까지의 공백을 메운다.
 * 신호는 네이티브만 보낼 수 있다.
 * 확정한 기록은 recovered로 내주고 홈이 안내 모달을 채운다.
 * 홈 랭킹 팝업이 복구 창과 겹치지 않도록 판단이 끝났는지를 settled로 함께 내준다.
 */
export function useLaunchSessionRecovery(userId: number | null): {
  recovered: SessionRecoveryResponse | null;
  settled: boolean;
  dismiss: () => void;
} {
  const queryClient = useQueryClient();
  // 어느 사용자의 마감 결과인지 함께 들고 있어야 렌더 시점에 남의 값을 걸러낼 수 있다.
  const [state, setState] = useState<RecoveryState>(() => initialState(userId));

  // 사용자가 바뀌면 이전 사용자의 결과를 들고 있으면 안 된다.
  if (state.userId !== userId) {
    setState(initialState(userId));
  }

  useEffect(() => {
    if (userId === null) {
      return;
    }
    // 진행 중이던 마감이 화면 전환보다 늦게 끝나도 낡은 콜백이 남의 기록을 올리지 못하게 취소 플래그로 버린다.
    let cancelled = false;
    let launched = false;
    const markSettled = () => {
      setState((prev) =>
        prev.userId !== userId || prev.settled ? prev : { ...prev, settled: true },
      );
    };
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type !== "app-launched") {
        return;
      }
      launched = true;
      void closeStaleSession(userId).then((result) => {
        if (cancelled) {
          return;
        }
        // 마감으로 오늘 집계와 연속일이 달라진다.
        // 홈을 벗어나지 않고 갱신해야 해서 직접 무효화한다.
        void queryClient.invalidateQueries({ queryKey: statsKeys.all });
        if (result !== null && result.focusSec >= 60) {
          trackSessionRecoveryPrompted(result.focusSec);
          // 판단이 끝났다고 알리기 전에 적어야 랭킹 팝업이 이 복구 창 앞에 끼어들지 않는다.
          markRecoveryShownThisLaunch();
          // 늦게 끝난 요청은 사용자 변경이 커밋된 뒤에 처리될 수 있어 state가 아직 같은 사용자 것일 때만 쓴다.
          setState((prev) => (prev.userId === userId ? { userId, result, settled: true } : prev));
          return;
        }
        markSettled();
      });
    });
    // 구독을 건 다음에 보낸다.
    // 네이티브는 이 신호를 받은 순간에만 응답하므로 순서가 바뀌면 응답을 놓친다.
    // 로드 콜백 대신 이 handshake를 쓰는 이유는 네이티브 쪽 주석에 있다.
    // Android는 로드가 실패해도 onLoad를 불러 줘서 로드 이벤트로는 발신 시점을 정할 수 없다.
    postToNative({ type: "home-ready", atMs: Date.now() });
    // 실행 신호는 실행마다 첫 홈 문서에만 온다.
    // 오지 않으면 복구할 것이 없으니 기다림을 끝낸다.
    const waitTimer = window.setTimeout(() => {
      if (!launched) {
        markSettled();
      }
    }, LAUNCH_SIGNAL_WAIT_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(waitTimer);
      unsubscribe();
    };
  }, [queryClient, userId]);

  const dismiss = () => {
    trackSessionRecoveryConfirmed();
    setState((prev) => ({ ...prev, result: null }));
  };

  // 되돌림을 예약한 이 렌더에서는 state가 아직 앞 사용자의 것이라 한 번 더 거른다.
  const current = state.userId === userId;
  return {
    recovered: current ? state.result : null,
    settled: current ? state.settled : initialState(userId).settled,
    dismiss,
  };
}
