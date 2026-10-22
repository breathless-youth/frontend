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

/**
 * 퇴장 애니메이션 중인 모달은 이미 닫힌 것으로 본다. Radix는 닫는 순간 `data-state="closed"`를 붙이고
 * 애니메이션이 끝나야 요소를 걷어내는데, 걷어낼 때까지 기다리면 네이티브 탭 바가 시트가 다 내려간
 * 뒤에야 돌아와 늦어 보인다. 열릴 때(요소가 붙는 순간 숨김)와 대칭으로 닫힘도 시작 시점에 알린다.
 * Base UI 바닥 시트(`ui/drawer.tsx`)는 같은 순간 `data-state` 대신 `data-closed`를 붙인다.
 */
const MODAL_ATTR_SELECTOR = '[aria-modal="true"]';
// Amplitude 가이드 토스트는 아래를 막지 않는데도 aria-modal을 달고 있어서 이 id로 뺀다.
// 같은 가이드의 모달은 다른 요소라 그대로 열림으로 본다.
const MODAL_SELECTOR = `${MODAL_ATTR_SELECTOR}:not([data-state="closed"]):not([data-closed]):not(#engagement-toast-responsive-inner-div)`;

/**
 * 탭 바 자리까지 덮는 모달(바텀시트)이 다는 속성. 다이얼로그는 탭 바를 남기고 딤으로 막지만,
 * 화면 바닥에 붙는 시트는 떠 있는 탭 바가 시트 아래쪽(저장 버튼)을 가리므로 탭 바를 숨겨야 한다.
 * 공용 `ui/drawer.tsx`가 모든 바닥 시트에 단다. 타임랩스 공유 창처럼 Dialog로 만든 바닥 시트는 직접 단다.
 */
export const COVERS_TAB_BAR_ATTR = "data-covers-tab-bar";
const COVERING_MODAL_SELECTOR = `${MODAL_SELECTOR}[${COVERS_TAB_BAR_ATTR}]`;

let open = false;
let coversTabBar = false;
let observer: MutationObserver | null = null;
const listeners = new Set<() => void>();

function readDocument(): { open: boolean; coversTabBar: boolean } {
  if (typeof document === "undefined") {
    return { open: false, coversTabBar: false };
  }
  return {
    open: document.querySelector(MODAL_SELECTOR) !== null,
    coversTabBar: document.querySelector(COVERING_MODAL_SELECTOR) !== null,
  };
}

function sync(): void {
  const next = readDocument();
  if (open === next.open && coversTabBar === next.coversTabBar) {
    return;
  }
  open = next.open;
  coversTabBar = next.coversTabBar;
  // 복사본을 돌려 순회 중 구독 해제가 일어나도 안전하게 한다.
  for (const listener of [...listeners]) {
    listener();
  }
}

function isModalMutation(record: MutationRecord): boolean {
  return record.type === "childList" || (record.target as Element).matches(MODAL_ATTR_SELECTOR);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (
    observer === null &&
    typeof MutationObserver !== "undefined" &&
    typeof document !== "undefined"
  ) {
    // 요소가 붙고 떨어지는 것에 더해 닫힘 표시가 붙는 순간도 잡는다(위 셀렉터 주석).
    // Radix는 `data-state`, Base UI는 `data-open`·`data-closed`로 알린다.
    // `data-state`는 툴팁·스위치·탭 같은 Radix 프리미티브 전부가 흔드는 속성이라, 모달 요소 자신의
    // 변화가 아니면 문서 전체 질의를 건너뛴다.
    observer = new MutationObserver((records) => {
      if (records.some(isModalMutation)) {
        sync();
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "data-open", "data-closed"],
    });
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

/**
 * 훅 밖에서 쓰는 모달 열림 구독
 *
 * 문서 관찰은 구독자가 있을 때만 돌아서 `isModalOverlayOpen()`은 구독하는 동안만 문서와 맞는다.
 */
export const subscribeModalOverlay = subscribe;
export const isModalOverlayOpen = getSnapshot;

function getCoversSnapshot(): boolean {
  return coversTabBar;
}

/** 열린 모달이 탭 바 자리까지 덮는지(바텀시트). 열린 모달이 없으면 false다. */
export function useModalOverlayCoversTabBar(): boolean {
  return useSyncExternalStore(subscribe, getCoversSnapshot, getServerSnapshot);
}

/** 테스트 전용: 모듈 스코프 상태를 기본값으로 되돌린다. 프로덕션 코드에서는 호출하지 않는다. */
export function __resetModalOverlayForTests(): void {
  observer?.disconnect();
  observer = null;
  open = false;
  coversTabBar = false;
  listeners.clear();
}
