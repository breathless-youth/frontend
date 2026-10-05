import { useSyncExternalStore } from "react";

import { postToNative, subscribeToNativeMessages } from "@/lib/bridge";

/**
 * 세션 중에 네이티브가 넘긴 초대코드
 *
 * 세션 화면과 결과 화면이 같은 값을 본다.
 * 세션 복원 확인 중에 온 초대도 잃지 않게, 네이티브 구독은 처음 읽힐 때 한 번 걸고 문서가 사라질 때까지 유지한다.
 * 새 초대가 오면 이전 코드를 덮어쓴다(마지막에 누른 링크가 사용자 의도다).
 */

let pendingCode: string | null = null;
let nativeSubscribed = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  if (!nativeSubscribed) {
    nativeSubscribed = true;
    subscribeToNativeMessages((message) => {
      if (message.type !== "session-invite") return;
      pendingCode = message.code;
      notify();
    });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string | null {
  return pendingCode;
}

export function useSessionInvite(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** `계속하기`로 초대 버리기 */
export function clearSessionInvite(): void {
  pendingCode = null;
  notify();
}

/** 세션 화면을 닫고 초대코드 화면을 열어 달라는 요청 */
export function leaveSessionForInvite(code: string): void {
  postToNative({ type: "navigate-home", inviteCode: code, atMs: Date.now() });
}
