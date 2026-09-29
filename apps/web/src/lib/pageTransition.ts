import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

import { prefersReducedMotion } from "@/lib/prefersReducedMotion";

export type SlideDirection = "forward" | "back";

/**
 * 전환 중에는 화면이 이전 스냅샷에 멈춰 있다. 스택이 빈 navigate(-1)처럼 커밋이 오지 않는
 * 이동에서 오래 멈추지 않게 짧게 끊는다. 평소 커밋은 한두 프레임이면 온다.
 */
export const PAGE_TRANSITION_COMMIT_TIMEOUT_MS = 400;

/**
 * 진행 중인 전환들의 커밋 대기자 모음. 전환이 겹치면(연속 탭 등) 실제 API는 갱신 콜백을
 * 시작 순서와 다르게 부를 수 있어, 단일 슬롯 하나에만 담으면 나중 전환이 앞 전환의 대기자를
 * 덮어써 앞 전환은 커밋 신호를 영영 못 받고 타임아웃까지 기다리게 된다.
 */
const pendingCommits = new Set<() => void>();
let activeFinished: Promise<void> | null = null;

/**
 * 이동을 좌우 슬라이드로 감싼다. react-router의 viewTransition 옵션은 data router에서만
 * 동작하고, 선언형 BrowserRouter는 위치 갱신을 startTransition으로 미뤄 flushSync로도
 * 당길 수 없다. 그래서 갱신 콜백이 라우트 커밋 시점에 풀리는 Promise를 돌려준다.
 * 우리 코드가 부른 이동만 감싸므로 WKWebView 가장자리 스와이프의 자체 애니메이션과 겹치지 않는다.
 */
export function slideNavigate(direction: SlideDirection, update: () => void): void {
  // lib.dom 타입에는 있지만 실제로는 Safari 등에서 없을 수 있어 런타임으로 확인한다.
  if (!("startViewTransition" in document) || prefersReducedMotion()) {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.pageTransition = direction;
  const transition = document.startViewTransition(() => {
    const committed = new Promise<void>((resolve) => {
      const settle = () => {
        window.clearTimeout(timer);
        pendingCommits.delete(settle);
        resolve();
      };
      const timer = window.setTimeout(settle, PAGE_TRANSITION_COMMIT_TIMEOUT_MS);
      pendingCommits.add(settle);
    });
    update();
    return committed;
  });
  // 전환이 겹치거나 문서가 숨겨지는 등으로 건너뛰어지면 ready가 거부된다. 잡아주지 않으면
  // 처리되지 않은 거부로 새서 Sentry에 잡힌다.
  transition.ready.catch(() => {});
  const finished: Promise<void> = transition.finished
    .catch(() => {})
    .finally(() => {
      // 앞 전환이 늦게 끝나도 뒤 전환의 방향을 지우지 않는다.
      if (activeFinished === finished) {
        activeFinished = null;
        delete root.dataset.pageTransition;
      }
    });
  activeFinished = finished;
}

/** 라우트가 커밋되면 대기 중인 모든 전환의 갱신 콜백을 푼다. 라우터 안에서 한 번만 마운트한다. */
export function usePageTransitionCommit(): void {
  const location = useLocation();
  useLayoutEffect(() => {
    // settle이 자기 자신을 집합에서 지우므로, 원본이 아니라 복사본을 돈다.
    for (const settle of [...pendingCommits]) {
      settle();
    }
  }, [location]);
}

/** 진행 중인 전환이 끝날 때 풀리는 Promise. 전환이 없으면 null이다. */
export function pageTransitionFinished(): Promise<void> | null {
  return activeFinished;
}

export function __resetPageTransitionForTests(): void {
  // 대기 중인 실제 400ms 타이머가 테스트 밖으로 새지 않게 함께 정리한다.
  for (const settle of [...pendingCommits]) {
    settle();
  }
  activeFinished = null;
}
