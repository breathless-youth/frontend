import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { VisionDetectorStatus } from "../../adapters/focusDetector";
import type { VisionFailureSource } from "../DevVisionFailureNotice";
import { DevVisionFailureNotice } from "../DevVisionFailureNotice";

/** 상태 두 개만 읽는 컴포넌트라 구독은 아무것도 하지 않는 것으로 채운다. */
function fakeDetector(
  status: VisionDetectorStatus,
  faceStatus: VisionDetectorStatus,
): VisionFailureSource {
  const never = () => () => {};
  return { status, faceStatus, subscribeStatus: never, subscribeFaceStatus: never };
}

describe("DevVisionFailureNotice", () => {
  it("둘 다 멀쩡하면 아무것도 그리지 않는다", () => {
    const { container } = render(
      <DevVisionFailureNotice detector={fakeDetector("ready", "ready")} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("얼굴 모델만 실패하면 졸음 감지 실패를 알린다", () => {
    render(<DevVisionFailureNotice detector={fakeDetector("ready", "unavailable")} />);
    expect(document.querySelector('[data-dev-notice="face-unavailable"]')).not.toBeNull();
    expect(document.querySelector('[data-dev-notice="vision-unavailable"]')).toBeNull();
  });

  it("얼굴 실패 문구가 원인을 로딩으로 못박지 않는다 — 추론이 도중에 죽어도 같은 상태가 된다", () => {
    render(<DevVisionFailureNotice detector={fakeDetector("ready", "unavailable")} />);
    const notice = document.querySelector('[data-dev-notice="face-unavailable"]');
    expect(notice?.textContent).toBe(
      "[DEV] 얼굴 모델을 쓸 수 없습니다 — 이 세션은 졸음을 감지하지 않습니다",
    );
  });

  it("둘 다 실패하면 감지 모델 실패만 알린다 — 객체 검출이 죽으면 얼굴은 의미가 없다", () => {
    render(<DevVisionFailureNotice detector={fakeDetector("unavailable", "unavailable")} />);
    expect(document.querySelector('[data-dev-notice="vision-unavailable"]')).not.toBeNull();
    expect(document.querySelector('[data-dev-notice="face-unavailable"]')).toBeNull();
  });

  it("역할을 주지 않는다 — 개발용 배너가 접근성 트리에 끼어들면 없는 상태를 알리게 된다", () => {
    render(<DevVisionFailureNotice detector={fakeDetector("ready", "unavailable")} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
