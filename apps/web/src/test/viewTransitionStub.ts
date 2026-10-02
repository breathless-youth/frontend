import { vi } from "vitest";

import { __resetPageTransitionForTests } from "@/lib/pageTransition";

/** 실제 API는 콜백을 다음 프레임에 부르지만, 순서만 지키면 되므로 동기로 부른다. */
export function stubViewTransition() {
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let updateDone: Promise<unknown> = Promise.resolve();
  const start = vi.fn((callback: () => Promise<void> | void) => {
    updateDone = Promise.resolve(callback());
    return {
      finished,
      updateCallbackDone: updateDone,
      ready: Promise.resolve(),
      skipTransition: vi.fn(),
    };
  });
  Object.defineProperty(document, "startViewTransition", { value: start, configurable: true });
  return { start, finish: () => finish(), updateDone: () => updateDone };
}

/** 스텁과 전환 상태를 되돌린다. 세 테스트 파일이 afterEach에서 같은 순서로 반복하던 정리다. */
export function resetViewTransitionStub(): void {
  Reflect.deleteProperty(document, "startViewTransition");
  delete document.documentElement.dataset.pageTransition;
  __resetPageTransitionForTests();
}
