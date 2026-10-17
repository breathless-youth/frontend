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

// 고르기 화면이 닫힐 때 그 화면을 연 문서에만 답한다.
let pickerReply: Reply | null = null;

function stateMessage(state: AppLockState): ToWebMessage {
  return { type: "app-lock-state", ...state, atMs: Date.now() };
}

let queue: Promise<void> = Promise.resolve();

/**
 * 방해 앱 잠금 브리지 메시지 처리
 *
 * 응답에는 개수만 싣는다.
 * 앱 이름과 선택 토큰은 기기 App Group 밖으로 내보내지 않는다.
 * 시작이 예약을 기다리는 사이 해제가 먼저 끝나면 예약 없이 잠금만 남아서, 메시지는 온 순서대로 하나씩 처리한다.
 * 앞 처리가 실패해도 뒤 메시지는 처리한다.
 */
export function handleAppLockMessage(message: AppLockMessage, reply: Reply): Promise<void> {
  const run = queue.then(() => handleNow(message, reply));
  queue = run.catch(() => undefined);
  return run;
}

async function handleNow(message: AppLockMessage, reply: Reply): Promise<void> {
  switch (message.type) {
    case "app-lock-query":
      reply(stateMessage(await getAppLockState()));
      break;
    case "app-lock-authorize":
      reply(stateMessage(await authorizeAppLock()));
      break;
    case "app-lock-pick":
      if (!isAppLockSupported()) {
        reply(stateMessage(await getAppLockState()));
        break;
      }
      pickerReply = reply;
      router.push("/app-lock-picker");
      break;
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
    stateMessage(
      selection === undefined ? await getAppLockState() : await saveSelection(selection),
    ),
  );
}
