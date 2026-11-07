import { useCallback, useSyncExternalStore } from "react";

const keyOf = (userId: number) => `focusmakers:planner-plan-opened:${userId}`;
const seenWithoutStorage = new Set<number>();
const listeners = new Set<() => void>();

function hasOpened(userId: number): boolean {
  try {
    if (localStorage.getItem(keyOf(userId)) === "1") return true;
  } catch {
    // 저장소가 막힌 문서에서는 아래 기억을 사용한다.
  }
  return seenWithoutStorage.has(userId);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** 플래너 업데이트 확인 여부를 기기에 계정별로 저장한다. */
export function usePlannerUpdateNotice(userId: number | null) {
  const seen = useSyncExternalStore(
    subscribe,
    () => userId === null || hasOpened(userId),
    () => true,
  );
  const markOpened = useCallback(() => {
    if (userId === null) return;
    try {
      localStorage.setItem(keyOf(userId), "1");
    } catch {
      seenWithoutStorage.add(userId);
    }
    listeners.forEach((listener) => listener());
  }, [userId]);
  return { unread: !seen, markOpened };
}
