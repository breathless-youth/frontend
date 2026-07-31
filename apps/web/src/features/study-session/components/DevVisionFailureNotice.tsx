import { useSyncExternalStore } from "react";

import type { VisionFocusDetector } from "../adapters/focusDetector";

/**
 * ⚠️ **개발 빌드 전용 — 이 파일이 통째로 걷어낼 지점이다.**
 *
 * 감지 모델 로딩이 최종 실패했을 때의 동작은 빌드에 따라 갈린다(리더 결정 2026-07-29).
 *
 * - **프로덕션** — 던지지 않고 **감지 없이 세션을 계속 진행**한다. 에러 화면을 띄우지 않는다.
 *   지금 카메라가 실패했을 때와 같은 동작이고, 그래서 이 컴포넌트는 프로덕션에서 아무것도
 *   그리지 않는다.
 * - **개발 빌드** — 실패를 **화면에 표시한다.** 콘솔 경고만으로는 조용히 mock처럼 도는 상태를
 *   개발 중에 알아채지 못하는데, 그게 더 위험하다.
 *
 * 걷어낼 때는 **이 파일을 지우고 `RoomPage`의 `import.meta.env.DEV &&` 블록 한 줄을 지우면
 * 끝난다** — 개발 전용 표시가 세션 화면 곳곳에 흩어지지 않도록 여기 하나로 모아 둔 이유다.
 *
 * `import.meta.env.DEV`는 Vite가 프로덕션 빌드에서 리터럴 `false`로 치환하므로 호출부의
 * `false && <DevVisionFailureNotice/>`가 통째로 접히고, 이 모듈은 참조가 사라져 번들에서 빠진다.
 */
export interface DevVisionFailureNoticeProps {
  detector: VisionFocusDetector;
}

export function DevVisionFailureNotice({ detector }: DevVisionFailureNoticeProps) {
  // 감지기는 React 밖에서 도는 가변 객체다 — 상태 변화를 렌더에 끌어오려면 외부 스토어로 읽는다.
  // `subscribeStatus`·`status`는 클로저 기반이라 렌더마다 같은 참조를 돌려준다(재구독하지 않는다).
  const status = useSyncExternalStore(
    detector.subscribeStatus,
    () => detector.status,
    () => detector.status,
  );

  if (!import.meta.env.DEV || status !== "unavailable") {
    return null;
  }

  return (
    // role을 주지 않는다 — 세션 화면의 `status`/`alertdialog` 접근성 트리에 개발용 배너가
    // 끼어들면 스크린리더 사용자에게 없는 상태를 알리게 되고, 기존 테스트의 역할 질의도 흔들린다.
    <p
      data-dev-notice="vision-unavailable"
      className="pointer-events-none absolute inset-x-0 top-0 z-50 bg-[#B0261A] px-4 py-[calc(env(safe-area-inset-top)+6px)] text-center text-[12px] leading-[16px] text-white"
    >
      [DEV] 감지 모델을 불러오지 못했습니다 — 이 세션은 감지 없이 시간만 측정합니다
    </p>
  );
}
