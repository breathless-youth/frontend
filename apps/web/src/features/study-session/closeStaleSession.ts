import { API_BASE_URL, parseApiError } from "@/lib/api";
import { reportHandled } from "@/lib/sentry";

/**
 * 마감에 거는 상한. 이 시간이 지나면 결과를 기다리지 않고 화면을 넘긴다.
 *
 * 서버가 응답 없이 물고 있으면 사용자가 공부를 아예 시작하지 못한다. 마감에 실패해 옛 세션이
 * 남는 것보다 시작이 막히는 쪽이 훨씬 나쁘다.
 */
const DEADLINE_MS = 4_000;

/** 한 번만 다시 시도한다. 버튼이 기다리고 있어 사이에 간격을 두지 않는다. */
async function retryOnce(signal: AbortSignal, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error: unknown) {
    // 상한을 넘겨 우리가 끊은 것이라면 다시 보내도 같은 자리에서 끊긴다.
    if (signal.aborted) {
      throw error;
    }
    await run();
  }
}

async function requestRecovery(userId: number, signal: AbortSignal): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/study-sessions/recovery?userId=${userId}`, {
    method: "POST",
    signal,
  });
  // 404는 마감할 세션이 없다는 정상 응답이다. 본문은 확정된 기록이지만 여기서는 쓰지 않는다.
  if (res.ok || res.status === 404) {
    return;
  }
  throw await parseApiError(res, "옛 세션 마감 실패");
}

/**
 * 서버에 남아 있는 옛 세션을 기록으로 확정하고 치운다. 새로 시작하는 진입점과 앱 실행 직후가
 * 호출처다.
 *
 * 룸 화면은 조회 결과가 있으면 복원, 없으면 새 세션이라는 규칙 하나로만 돈다. 그 규칙이
 * 성립하려면 의도적으로 새로 시작하는 경로에서 옛 세션이 먼저 사라져 있어야 한다. 판별과
 * 확정을 서버가 한 번에 하므로 여기서는 결과를 읽지 않고 완료만 기다린다.
 *
 * 어떤 실패에서도 던지지 않고, 상한을 넘기면 기다리지 않는다. 세션 시작을 네트워크 상태로
 * 막지 않는 것이 더 중요하다. 마감하지 못한 세션은 5분 뒤 서버가 자동 확정하므로 기록은
 * 사라지지 않는다.
 */
export async function closeStaleSession(userId: number | null): Promise<void> {
  if (userId === null) {
    return;
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve();
    }, DEADLINE_MS);
  });
  try {
    await Promise.race([
      retryOnce(controller.signal, () => requestRecovery(userId, controller.signal)).catch(
        (error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          reportHandled(error, "stale-session-close");
        },
      ),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
