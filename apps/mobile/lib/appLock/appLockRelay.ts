import { router } from "expo-router";

import type { HandlerMessage, ToWebMessage } from "@focusmakers/types";

import {
  type AppLockState,
  authorizeAppLock,
  getAppLockState,
  isAppLockSupported,
  saveSelection,
  startStudyLock,
  stopStudyLock,
} from "./appLock";

type Reply = (message: ToWebMessage) => void;
type AppLockMessage = Extract<HandlerMessage, { type: `app-lock-${string}` }>;

// 고르기 화면이 닫힐 때 그 화면을 연 문서의 그 요청에만 답한다.
let pickerReply: ((state: AppLockState) => void) | null = null;

function stateMessage(state: AppLockState, id: string): ToWebMessage {
  return { type: "app-lock-state", id, ...state, atMs: Date.now() };
}

/**
 * 고르기 요청에 답할 상태
 *
 * 답이 없으면 웹의 고르기 요청이 시간 제한까지 기다린다.
 * 실패한 조회를 다시 부르지 않고 잠글 수 없는 상태로 답한다.
 */
async function pickerState(read: () => Promise<AppLockState>): Promise<AppLockState> {
  try {
    return await read();
  } catch (error) {
    console.warn("[app-lock] 고르기 상태 읽기 실패", error);
    return {
      supported: isAppLockSupported(),
      authorized: false,
      revoked: false,
      appCount: 0,
      categoryCount: 0,
    };
  }
}

let queue: Promise<void> = Promise.resolve();

/**
 * 방해 앱 잠금 브리지 메시지 처리
 *
 * 응답에는 개수만 싣는다.
 * 앱 이름과 선택 토큰은 기기 App Group 밖으로 내보내지 않는다.
 * 시작이 예약을 기다리는 사이 해제가 먼저 끝나면 예약 없이 잠금만 남아서, 시작과 해제는 온 순서대로 하나씩 처리한다.
 * 권한 요청은 사용자가 OS 창에 답할 때까지 끝나지 않아서, 같은 줄에 세우면 그 뒤의 조회가 웹의 시간 제한을 넘긴다.
 * 조회·권한 요청·고르기는 잠금을 걸거나 풀지 않으므로 줄을 거치지 않고 바로 처리한다.
 * 앞 시작·해제가 실패해도 뒤 메시지는 처리한다.
 */
export function handleAppLockMessage(message: AppLockMessage, reply: Reply): Promise<void> {
  if (message.type !== "app-lock-start" && message.type !== "app-lock-stop") {
    return handleNow(message, reply);
  }
  const run = queue.then(() => handleNow(message, reply));
  queue = run.catch(() => undefined);
  return run;
}

async function handleNow(message: AppLockMessage, reply: Reply): Promise<void> {
  switch (message.type) {
    case "app-lock-query":
      reply(stateMessage(await getAppLockState(), message.id));
      break;
    case "app-lock-authorize":
      reply(stateMessage(await authorizeAppLock(), message.id));
      break;
    case "app-lock-pick": {
      const { id } = message;
      // 이미 열린 화면의 답을 덮어쓰면 먼저 연 요청은 답을 받지 못한다.
      if (!isAppLockSupported() || pickerReply !== null) {
        reply(stateMessage(await pickerState(getAppLockState), id));
        break;
      }
      pickerReply = (state) => reply(stateMessage(state, id));
      try {
        router.push("/app-lock-picker");
      } catch (error) {
        // 화면이 열리지 않으면 닫힘 알림도 오지 않는다.
        pickerReply = null;
        reply(stateMessage(await pickerState(getAppLockState), id));
        throw error;
      }
      break;
    }
    case "app-lock-start": {
      const counts = await startStudyLock();
      if (counts !== null) {
        reply({ type: "app-lock-started", ...counts, atMs: Date.now() });
      }
      break;
    }
    case "app-lock-stop":
      await stopStudyLock();
      break;
  }
}

/**
 * 고르기 화면이 닫혔다는 알림
 *
 * 완료 버튼과 아래로 쓸어 닫기가 모두 이 경로로 온다.
 * 아무것도 바꾸지 않고 닫았으면 `selection`이 undefined라 저장된 선택을 그대로 둔다.
 * 선택 화면은 전부 지우면 null을 보내므로 null은 지움이다.
 */
export async function notifyPickerClosed(selection: string | null | undefined): Promise<void> {
  const reply = pickerReply;
  if (reply === null) {
    return;
  }
  pickerReply = null;
  reply(
    await pickerState(() =>
      selection === undefined ? getAppLockState() : saveSelection(selection),
    ),
  );
}
