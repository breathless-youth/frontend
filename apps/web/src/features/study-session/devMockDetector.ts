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

/** `?detector=mock`. 이 값일 때만 mock이 실제 Vision 추론을 이긴다. */
export const DEV_MOCK_DETECTOR_QUERY = "mock";

/** 선택 로그는 세션당 한 번이면 충분하다 — StrictMode의 lazy initializer 이중 호출로 두 줄이 나온다. */
let choiceLogged = false;

function logDetectorChoice(message: string): void {
  if (choiceLogged) {
    return;
  }
  choiceLogged = true;
  // 공유 `no-console` 규칙은 warn/error만 허용하지만 이건 경고가 아니라 개발 안내다.
  // warn으로 올리면 실제 경고에 섞이고, `console.debug`는 브라우저 기본 필터에서 접혀 있어
  // 필요할 때만 Verbose로 펼치면 된다(`vision/diagnostics.ts`와 같은 판단).
  // eslint-disable-next-line no-console -- 위 사유
  console.debug("[detector]", message);
}

/**
 * DEV에서 감지기를 mock으로 **덮어쓸지** 결정한다.
 *
 * 기본은 **실제 Vision 추론**이다. `?detector=mock`을 붙였을 때만 콘솔 mock이 이긴다 —
 * 실기기·카메라 없이 비집중(S3-2) 시나리오를 재현해야 할 때가 계속 있기 때문에 남겨 둔다.
 * 프로덕션에서는 쿼리를 무시하고 항상 `undefined`를 돌려준다.
 *
 * 어느 쪽이 이겼는지는 DEV 콘솔에 남긴다 — mock으로 돌고 있는 줄 모른 채 "감지가 안 된다"고
 * 판단하는 것이 이 배선에서 가장 흔한 오진이다.
 *
 * @param requested `?detector=` 쿼리 값 (없으면 `null`)
 */
export function resolveDevDetectorOverride(
  requested: string | null,
): MockFocusDetector | undefined {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return undefined;
  }
  if (requested !== DEV_MOCK_DETECTOR_QUERY) {
    logDetectorChoice("실제 Vision 추론을 사용합니다 (mock으로 바꾸려면 ?detector=mock)");
    return undefined;
  }
  const detector = createDevMockDetector();
  logDetectorChoice(
    "?detector=mock — 콘솔 mock이 Vision 추론을 대신합니다. " +
      'window.__focusonMockDetector.emit({ trigger: "PHONE", active: true })',
  );
  return detector;
}
