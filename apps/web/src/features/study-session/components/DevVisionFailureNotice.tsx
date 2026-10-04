import { useSyncExternalStore } from "react";

import type { VisionDetectorStatus, VisionFocusDetector } from "../adapters/focusDetector";

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
/**
 * 이 컴포넌트가 실제로 읽는 멤버만.
 *
 * 감지기 전체를 요구하면 테스트가 쓰지도 않는 멤버를 캐스팅으로 채워야 하고, 그러면 무엇을
 * 읽는 컴포넌트인지가 타입에서 사라진다.
 */
export type VisionFailureSource = Pick<
  VisionFocusDetector,
  "status" | "faceStatus" | "subscribeStatus" | "subscribeFaceStatus"
>;

export interface DevVisionFailureNoticeProps {
  detector: VisionFailureSource;
}

interface DevFailureNotice {
  readonly notice: string;
  readonly message: string;
}

/**
 * 어느 실패를 알릴지 고른다.
 *
 * 객체 검출이 죽으면 얼굴도 무의미하므로 둘 다 실패했을 때는 객체 쪽만 고른다. 두 줄을 겹쳐
 * 띄우면 먼저 봐야 할 것이 가려진다.
 */
function pickFailure(
  status: VisionDetectorStatus,
  faceStatus: VisionDetectorStatus,
): DevFailureNotice | null {
  if (status === "unavailable") {
    return {
      notice: "vision-unavailable",
      message: "[DEV] 감지 모델을 불러오지 못했습니다 — 이 세션은 감지 없이 시간만 측정합니다",
    };
  }
  if (faceStatus === "unavailable") {
    // "불러오지 못했다"로 쓰지 않는다. 얼굴 모델은 로딩에 성공한 뒤 추론이 연속으로 실패해도
    // 감지 불가가 되므로, 원인을 로딩으로 못박으면 추적이 엉뚱한 곳으로 간다.
    return {
      notice: "face-unavailable",
      message: "[DEV] 얼굴 모델을 쓸 수 없습니다 — 이 세션은 졸음을 감지하지 않습니다",
    };
  }
  return null;
}

export function DevVisionFailureNotice({ detector }: DevVisionFailureNoticeProps) {
  // 감지기는 React 밖에서 도는 가변 객체다 — 상태 변화를 렌더에 끌어오려면 외부 스토어로 읽는다.
  // `subscribeStatus`·`status`는 클로저 기반이라 렌더마다 같은 참조를 돌려준다(재구독하지 않는다).
  const status = useSyncExternalStore(
    detector.subscribeStatus,
    () => detector.status,
    () => detector.status,
  );
  const faceStatus = useSyncExternalStore(
    detector.subscribeFaceStatus,
    () => detector.faceStatus,
    () => detector.faceStatus,
  );

  const failure = import.meta.env.DEV ? pickFailure(status, faceStatus) : null;
  if (failure === null) {
    return null;
  }

  return (
    // role을 주지 않는다 — 세션 화면의 `status`/`alertdialog` 접근성 트리에 개발용 배너가
    // 끼어들면 스크린리더 사용자에게 없는 상태를 알리게 되고, 기존 테스트의 역할 질의도 흔들린다.
    <p
      data-dev-notice={failure.notice}
      className="pointer-events-none absolute inset-x-0 top-0 z-50 bg-[#B0261A] px-4 py-[calc(env(safe-area-inset-top)+6px)] text-center text-[12px] leading-[16px] text-white"
    >
      {failure.message}
    </p>
  );
}
