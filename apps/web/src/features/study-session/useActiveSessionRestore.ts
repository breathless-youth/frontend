import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { reportHandled } from "@/lib/sentry";

import type { RestoredSession } from "./restoreActiveSession";
import { restoreActiveSession } from "./restoreActiveSession";

/** 일시 장애로 보고 다시 시도하는 횟수. 복원을 놓치면 사용자가 처음부터 다시 시작해야 한다. */
const MAX_RETRY = 2;
const RETRY_DELAY_MS = 1_000;

export interface ActiveSessionRestoreState {
  /** 조회가 끝났는가. false인 동안 룸 화면은 세션을 시작하지 않는다. */
  settled: boolean;
  /** 이어받을 세션. 없으면 새 세션으로 시작한다. */
  restored: RestoredSession | null;
}

const NOT_SETTLED: ActiveSessionRestoreState = { settled: false, restored: null };
const NOTHING_TO_RESTORE: ActiveSessionRestoreState = { settled: true, restored: null };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 룸 진입 게이트. 서버에 진행중 세션이 있으면 받아 온다.
 *
 * 결착 전에 세션을 시작하면 사용자가 0분에서 복원값으로 튀는 것을 보고, 그 사이에 스냅샷
 * 보고가 낡은 시작 시각으로 나갈 수 있다. 그래서 호출부는 `settled`가 참이 될 때까지 기다린다.
 *
 * 400과 409는 다시 보내도 같은 결과라 즉시 포기한다. 나머지 실패만 다시 시도한다.
 *
 * ⚠️ **"한 번만 조회한다"는 ref 가드를 두지 말 것.** StrictMode는 effect를 걸고 정리한 뒤 다시
 * 거는데, 그런 가드가 있으면 두 번째 실행이 막히고 첫 실행 결과는 정리 단계의 취소 플래그에
 * 걸려 버려진다. 그러면 `settled`가 영원히 false로 남아 룸 화면이 뜨지 않는다. 조회는 값을
 * 바꾸지 않는 GET이라 개발 환경에서 두 번 나가는 편이 안전하다.
 */
export function useActiveSessionRestore(userId: number | null): ActiveSessionRestoreState {
  const [state, setState] = useState<ActiveSessionRestoreState>(() =>
    userId === null ? NOTHING_TO_RESTORE : NOT_SETTLED,
  );

  useEffect(() => {
    if (userId === null) {
      setState(NOTHING_TO_RESTORE);
      return;
    }
    let cancelled = false;
    // 사용자가 바뀌면 이전 사용자의 결과를 들고 있으면 안 되므로 대기 상태로 되돌린다.
    setState(NOT_SETTLED);

    async function run(id: number) {
      for (let attempt = 0; attempt <= MAX_RETRY; attempt += 1) {
        try {
          const restored = await restoreActiveSession(id);
          if (!cancelled) {
            setState({ settled: true, restored });
          }
          return;
        } catch (error: unknown) {
          if (cancelled) {
            return;
          }
          const permanent =
            error instanceof ApiError && (error.status === 400 || error.status === 409);
          if (permanent) {
            reportHandled(error, "session-restore");
            break;
          }
          if (attempt === MAX_RETRY) {
            break;
          }
          await delay(RETRY_DELAY_MS);
          // 기다리는 동안 화면을 떠났을 수 있다. 다음 요청을 보내기 전에 다시 확인한다.
          if (cancelled) {
            return;
          }
        }
      }
      if (!cancelled) {
        setState(NOTHING_TO_RESTORE);
      }
    }

    void run(userId);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}
