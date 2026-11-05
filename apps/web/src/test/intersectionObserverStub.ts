import { onTestFinished, vi } from "vitest";

/**
 * 목록 끝 감지를 테스트에서 일으키기
 *
 * jsdom에는 IntersectionObserver가 없어서 지켜보는 요소를 기억하는 가짜를 넣고, `reach()`가 그 요소가 보였다고 알린다.
 * 화면 단위 테스트도 앱 전체를 불러오지 않고 쓰도록 라우트 테스트 도우미와 따로 둔다.
 */
export function stubIntersectionObserver(): { reach(): void } {
  const observers = new Set<StubObserver>();

  class StubObserver {
    readonly root = null;
    readonly rootMargin = "0px";
    readonly thresholds = [0];
    readonly targets = new Set<Element>();
    readonly callback: IntersectionObserverCallback;

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
      observers.add(this);
    }

    observe(target: Element) {
      this.targets.add(target);
    }

    unobserve(target: Element) {
      this.targets.delete(target);
    }

    disconnect() {
      this.targets.clear();
      observers.delete(this);
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal("IntersectionObserver", StubObserver);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  return {
    reach() {
      for (const observer of [...observers]) {
        const entries = [...observer.targets].map(
          (target) => ({ isIntersecting: true, target }) as IntersectionObserverEntry,
        );
        if (entries.length > 0) {
          observer.callback(entries, observer as unknown as IntersectionObserver);
        }
      }
    },
  };
}
