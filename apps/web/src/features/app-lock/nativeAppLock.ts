import type { ToNativeMessage, ToWebMessage } from "@focusmakers/types";

import { postToNative, subscribeToNativeMessages } from "@/lib/bridge";

import { hasAppLockCapability } from "./appLockCapability";
import { readAppLockEnabled } from "./appLockSettings";

export type AppLockState = Omit<Extract<ToWebMessage, { type: "app-lock-state" }>, "type" | "atMs">;

export const APP_LOCK_RESPONSE_TIMEOUT_MS = 5000;
// 권한 창 앞에서 사용자가 고민하는 시간이 이 안에 들어간다.
// 짧게 잡으면 뒤늦게 누른 허용이 버려진다.
const AUTHORIZE_TIMEOUT_MS = 120_000;

type RequestType = Extract<ToNativeMessage, { type: `app-lock-${string}` }>["type"];

// 끝나지 않은 마지막 요청이다. 비어 있으면 바로 보낸다.
let lastRequest: Promise<unknown> | null = null;

/**
 * `app-lock-state` 응답을 기다리는 요청
 *
 * 응답에 요청 id가 없어 다음에 오는 상태를 답으로 본다.
 * 겹쳐 보내면 두 요청이 한 응답을 나눠 가지므로 앞 요청이 답을 받거나 시간이 다 된 뒤에 보낸다.
 */
function requestState(type: RequestType, timeoutMs: number | null): Promise<AppLockState | null> {
  if (!hasAppLockCapability()) {
    return Promise.resolve(null);
  }
  const send = () => sendAndWait(type, timeoutMs);
  const request = lastRequest === null ? send() : lastRequest.then(send);
  lastRequest = request;
  void request.then(() => {
    if (lastRequest === request) lastRequest = null;
  });
  return request;
}

/**
 * 요청 하나를 보내고 응답 기다리기
 *
 * 구독을 먼저 걸고 보내야 빠른 응답을 놓치지 않는다.
 * `timeoutMs`가 null이면 사용자가 닫을 때까지 기다린다.
 */
function sendAndWait(type: RequestType, timeoutMs: number | null): Promise<AppLockState | null> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (state: AppLockState | null) => {
      unsubscribe();
      clearTimeout(timer);
      resolve(state);
    };
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type === "app-lock-state") {
        const { type: _type, atMs: _atMs, ...state } = message;
        finish(state);
      }
    });
    if (timeoutMs !== null) {
      timer = setTimeout(() => finish(null), timeoutMs);
    }
    if (!postToNative({ type, atMs: Date.now() })) {
      finish(null);
    }
  });
}

export function queryAppLock(): Promise<AppLockState | null> {
  return requestState("app-lock-query", APP_LOCK_RESPONSE_TIMEOUT_MS);
}

export function authorizeAppLock(): Promise<AppLockState | null> {
  return requestState("app-lock-authorize", AUTHORIZE_TIMEOUT_MS);
}

export function pickAppLockApps(): Promise<AppLockState | null> {
  return requestState("app-lock-pick", null);
}

export function startAppLock(): void {
  if (hasAppLockCapability() && readAppLockEnabled()) {
    postToNative({ type: "app-lock-start", atMs: Date.now() });
  }
}

/** 공부 중에 설정을 꺼도 걸린 잠금은 풀려야 해서 켜짐 여부를 보지 않는다. */
export function stopAppLock(): void {
  if (hasAppLockCapability()) {
    postToNative({ type: "app-lock-stop", atMs: Date.now() });
  }
}

export function subscribeAppLockStarted(
  listener: (counts: { appCount: number; categoryCount: number }) => void,
): () => void {
  return subscribeToNativeMessages((message) => {
    if (message.type === "app-lock-started") {
      listener({ appCount: message.appCount, categoryCount: message.categoryCount });
    }
  });
}
