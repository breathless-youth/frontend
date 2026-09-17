import { useSyncExternalStore } from "react";

/**
 * 웹 모달이 열려 있는지 — `aria-modal="true"` 요소가 문서에 있는지가 유일한 판단 근거다.
 *
 * 모달마다 훅을 부르게 하면 새 모달을 만드는 사람이 한 번 빠뜨리는 순간 네이티브 탭 바가
 * 다시 눌린다(`nativeTabBar.ts`의 경로 목록이 같은 이유로 한 곳에 모여 있다). 지금 손으로
 * 만든 모달만 셋이라 빠뜨릴 자리가 그만큼 많다.
 *
 * 토스트나 툴팁처럼 아래를 막지 않는 오버레이에는 이 속성이 없어 저절로 빠진다. 반대로
 * 속성을 달았는데 탭 이동을 허용해야 하는 오버레이가 있다면 그 속성이 틀린 것이다.
 *
 * 모듈 스코프인 이유는 `apps/mobile/lib/tabBarVisibility.ts`와 같다. 관찰 대상이 React 트리
 * 밖의 document라 어느 컴포넌트에도 속하지 않는다.
 */

const MODAL_SELECTOR = '[aria-modal="true"]';

let open = false;
let observer: MutationObserver | null = null;
const listeners = new Set<() => void>();

function readDocument(): boolean {
  return typeof document !== "undefined" && document.querySelector(MODAL_SELECTOR) !== null;
}

function sync(): void {
  const next = readDocument();
  if (open === next) {
    return;
  }
  open = next;
  // 복사본을 돌려 순회 중 구독 해제가 일어나도 안전하게 한다.
  for (const listener of [...listeners]) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (
    observer === null &&
    typeof MutationObserver !== "undefined" &&
    typeof document !== "undefined"
  ) {
    // 모달은 열고 닫힐 때 요소 자체가 붙었다 떨어진다 — 속성 변화는 볼 필요가 없다.
    observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = null;
    }
  };
}

function getSnapshot(): boolean {
  return open;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useModalOverlayOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** 테스트 전용: 모듈 스코프 상태를 기본값으로 되돌린다. 프로덕션 코드에서는 호출하지 않는다. */
export function __resetModalOverlayForTests(): void {
  observer?.disconnect();
  observer = null;
  open = false;
  listeners.clear();
}
