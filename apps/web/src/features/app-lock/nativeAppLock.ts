import type { ToNativeMessage, ToWebMessage } from "@focusmakers/types";

import { postToNative, subscribeToNativeMessages } from "@/lib/bridge";

import { hasAppLockCapability } from "./appLockCapability";
import { readAppLockEnabled } from "./appLockSettings";

export type AppLockState = Omit<
  Extract<ToWebMessage, { type: "app-lock-state" }>,
  "type" | "id" | "atMs"
>;

export const APP_LOCK_RESPONSE_TIMEOUT_MS = 5000;
// 권한 창 앞에서 사용자가 고민하는 시간이 이 안에 들어간다.
// 짧게 잡으면 뒤늦게 누른 허용이 버려진다.
const AUTHORIZE_TIMEOUT_MS = 120_000;
// 사용자가 고르는 시간보다 넉넉하게 잡는다.
// 응답을 잃어도 고르기 화면 요청이 끝나지 않고 남지 않게 한다.
const PICK_TIMEOUT_MS = 10 * 60_000;

type RequestType = Extract<ToNativeMessage, { type: `app-lock-${string}`; id: string }>["type"];

/**
 * 요청 하나를 보내고 같은 id의 응답 기다리기
 *
 * 구독을 먼저 걸고 보내야 빠른 응답을 놓치지 않는다.
 * 시간이 다 된 요청의 늦은 응답은 id가 달라 다음 요청의 답이 되지 않는다.
 */
function requestState(type: RequestType, timeoutMs: number): Promise<AppLockState | null> {
  if (!hasAppLockCapability()) {
    return Promise.resolve(null);
  }
  // LAN 주소(http)로 연 개발 웹뷰는 비보안 문서라 randomUUID가 없다.
  // 앱은 비지 않은 문자열이면 받으므로 그때는 난수 문자열로 대신한다.
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Math.random());
  return new Promise((resolve) => {
    const finish = (state: AppLockState | null) => {
      unsubscribe();
      clearTimeout(timer);
      resolve(state);
    };
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type === "app-lock-state" && message.id === id) {
        const { type: _type, id: _id, atMs: _atMs, ...state } = message;
        finish(state);
      }
    });
    const timer = setTimeout(() => finish(null), timeoutMs);
    if (!postToNative({ type, id, atMs: Date.now() })) {
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
  return requestState("app-lock-pick", PICK_TIMEOUT_MS);
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
