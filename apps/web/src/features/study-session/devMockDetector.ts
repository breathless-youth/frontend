import type { MockFocusDetector } from "./adapters/focusDetector";
import { createMockFocusDetector } from "./adapters/focusDetector";

declare global {
  interface Window {
    /** 개발 빌드에서만 존재한다. */
    __focusonMockDetector?: MockFocusDetector;
  }
}

/**
 * 모듈 스코프 싱글턴.
 *
 * React 19 StrictMode는 dev에서 `useState` lazy initializer를 두 번 호출한다(`main.tsx`).
 * 인스턴스를 매번 새로 만들면 훅이 잡은 detector와 `window.__focusonMockDetector`가
 * 서로 다른 객체가 되어 브리지로 emit해도 화면이 반응하지 않는다 —
 * 여기서 멱등하게 만들어 두 번 호출되어도 같은 인스턴스를 돌려준다.
 */
let devDetector: MockFocusDetector | undefined;

/**
 * 개발 전용 감지 트리거.
 *
 * 실제 Vision/가속도 센서가 없으므로 개발 중 S3-2(비집중) 상태를 눈으로 확인하려면
 * 수동으로 원신호를 밀어넣어야 한다. **프로덕션 UI에는 감지 상태를 바꾸는 버튼을 만들지 않는다**
 * (SCR-S3-1·S3-2 구현 노트 4번) — 대신 개발 빌드에서만 콘솔에서 호출할 수 있게 노출한다.
 *
 * ```js
 * window.__focusonMockDetector.emit({ trigger: "PHONE", active: true });   // 0.5초 뒤 비집중
 * window.__focusonMockDetector.emit({ trigger: "PHONE", active: false });  // 1.5초 뒤 자동 재개
 * ```
 *
 * 프로덕션 빌드에서는 undefined를 돌려주고 훅이 기본 mock(신호 없음)을 쓴다.
 */
export function createDevMockDetector(): MockFocusDetector | undefined {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return undefined;
  }
  devDetector ??= createMockFocusDetector();
  window.__focusonMockDetector = devDetector;
  return devDetector;
}
