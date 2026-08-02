import { useSyncExternalStore } from "react";

/**
 * 하단 탭 바 가시성 — 웹이 보내는 `set-tab-bar` 브리지 메시지가 유일한 입력이다.
 *
 * 전체 화면 웹 라우트(온보딩 가이드 G1~G5·문의하기·약관·개인정보처리방침)는 탭 웹뷰 **안에서**
 * 웹 라우팅으로 열려 네이티브 스택을 건너지 않는다. 네이티브는 그 이동을 알 수 없으므로 웹이
 * 알려줘야 하고, 받은 값을 탭 레이아웃까지 옮기는 통로가 여기다.
 *
 * ## 왜 Context가 아니라 모듈 스코프인가
 *
 * 수신부(`nativeBridgeHandler`)가 React 트리 밖의 순수 함수다 — 화면 3개가 공유하는 공용
 * 핸들러라 어느 컴포넌트에도 속하지 않는다. Context로 만들면 핸들러가 dispatch를 받으려고
 * 화면마다 배선을 다시 타야 하고, 그 배선이 빠진 화면에서 조용히 동작하지 않는다.
 * `remoteQueryParams`가 같은 이유로 모듈 스코프 캐시를 쓴다.
 *
 * ## 기본값은 "보임"이다
 *
 * 앱 시작·웹뷰 재로드 직후처럼 아직 아무 메시지도 오지 않은 상태에서 탭 바가 없으면 사용자가
 * 이동 수단을 잃는다. 반대(전체 화면에서 잠깐 탭 바가 보임)는 웹이 마운트되며 곧 정정한다.
 */

let visible = true;
const listeners = new Set<() => void>();

export function setTabBarVisible(next: boolean): void {
  if (visible === next) {
    return;
  }
  visible = next;
  // 복사본을 돌려 순회 중 구독 해제가 일어나도 안전하게 한다.
  for (const listener of [...listeners]) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return visible;
}

export function useTabBarVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** 테스트 전용: 모듈 스코프 상태를 기본값으로 되돌린다. 프로덕션 코드에서는 호출하지 않는다. */
export function __resetTabBarVisibilityForTests(): void {
  visible = true;
  listeners.clear();
}
