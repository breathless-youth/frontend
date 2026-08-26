import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { CameraPreviewSurface } from "../components/CameraPreviewSurface";
import { PREVIEW_OBJECT_FIT } from "../previewFit";

/**
 * `videoRef`는 이제 **호출부가 소유한다** — 추론(`createVisionFocusDetector`)이 표시와 같은
 * `<video>`를 봐야 프레임 복사가 한 번 줄기 때문이다(설계 §3). 이 컴포넌트는 참조를 받을 뿐
 * MediaPipe를 모른다.
 */
function videoRef() {
  return createRef<HTMLVideoElement>();
}

describe("CameraPreviewSurface", () => {
  it("스트림이 없어도 video를 상시 마운트하고 목업 라벨을 그리지 않는다", () => {
    const { container } = render(
      <CameraPreviewSurface stream={null} facing="front" videoRef={videoRef()} />,
    );

    expect(container.querySelector("video")).not.toBeNull();
    expect(screen.queryByText("[ 전 면 카 메 라 프 리 뷰 ]")).toBeNull();
  });

  it("스트림을 붙이면 재생을 직접 건다 — autoplay 속성에만 맡기지 않는다", () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    render(<CameraPreviewSurface stream={stream} facing="front" videoRef={videoRef()} />);

    expect(playSpy).toHaveBeenCalled();
  });

  it("재생이 멈추는 신호(suspend·pause)가 오면 다시 건다 — 첫 play() 거부에 대비한다", () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const { container } = render(
      <CameraPreviewSurface stream={stream} facing="front" videoRef={videoRef()} />,
    );
    const video = container.querySelector("video");
    playSpy.mockClear();

    fireEvent.loadedMetadata(video as HTMLVideoElement);
    fireEvent.suspend(video as HTMLVideoElement);
    fireEvent.pause(video as HTMLVideoElement);

    expect(playSpy).toHaveBeenCalledTimes(3);
  });

  it("스트림이 없으면 멈춤 신호가 와도 재생을 걸지 않는다 — 빈 video에 재시도 루프를 만들지 않는다", () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { container } = render(
      <CameraPreviewSurface stream={null} facing="front" videoRef={videoRef()} />,
    );
    const video = container.querySelector("video");
    playSpy.mockClear();

    fireEvent.suspend(video as HTMLVideoElement);

    expect(playSpy).not.toHaveBeenCalled();
  });

  it("video는 탭을 받지 않는다 — 탭이 닿으면 iOS가 네이티브 컨트롤을 띄운다", () => {
    const { container } = render(
      <CameraPreviewSurface stream={null} facing="front" videoRef={videoRef()} />,
    );

    expect(container.querySelector("video")?.className).toContain("pointer-events-none");
  });

  it("video에 Amplitude용 amp-block과 Sentry용 sentry-block 차단 표식이 둘 다 붙는다", () => {
    const { container } = render(
      <CameraPreviewSurface stream={null} facing="front" videoRef={videoRef()} />,
    );
    const video = container.querySelector("video");

    // 전역 설정(blockSelector·blockAllMedia)이 1차 방어지만, 설정이 바뀌어도 요소 단위
    // 방어가 남도록 두 도구의 차단 클래스를 함께 태깅한다.
    expect(video?.classList.contains("amp-block")).toBe(true);
    expect(video?.classList.contains("sentry-block")).toBe(true);
  });

  it("video는 음소거·인라인 재생이다 — 소리를 내거나 전체화면으로 튀면 안 된다", () => {
    const { container } = render(
      <CameraPreviewSurface stream={null} facing="front" videoRef={videoRef()} />,
    );
    const video = container.querySelector("video");

    expect(video).toHaveAttribute("playsinline");
    expect(video?.muted).toBe(true);
  });

  it("autoplay 속성을 달지 않는다 — iOS 저전력 모드가 autoplay 영상에 네이티브 컨트롤을 강제한다", () => {
    const { container } = render(
      <CameraPreviewSurface stream={null} facing="front" videoRef={videoRef()} />,
    );

    // 재생은 startVideoPlayback 킥이 건다. 속성이 있으면 WebKit이 저전력 모드에서
    // 숨길 수 없는 재생 컨트롤을 영상 위에 띄운다(WebKit 219889, Won't Fix).
    expect(container.querySelector("video")).not.toHaveAttribute("autoplay");
  });

  it("전달된 스트림을 video의 srcObject에 붙인다", () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const { container } = render(
      <CameraPreviewSurface stream={stream} facing="front" videoRef={videoRef()} />,
    );

    expect(container.querySelector("video")?.srcObject).toBe(stream);
  });

  it("스트림이 없어도 videoRef가 붙는다 — 추론이 이 참조로 프레임을 읽는다", () => {
    const ref = videoRef();
    const { container } = render(
      <CameraPreviewSurface stream={null} facing="front" videoRef={ref} />,
    );

    expect(ref.current).toBe(container.querySelector("video"));
  });

  /**
   * 표시 방식은 `previewFit.ts`가 단일 출처다 — 진단 오버레이가 같은 상수를 읽어 여백/잘림을
   * 계산하므로, 컴포넌트가 그 값을 실제로 따르는지 못 박아야 둘이 어긋나지 않는다
   * (2026-07-30에 실제로 어긋나 "여백이 없는데 여백 72%"를 보고했다).
   *
   * jsdom에는 레이아웃이 없어 실제 배치를 잴 수 없으므로 클래스로 확인한다.
   */
  it("표시 방식이 PREVIEW_OBJECT_FIT을 따른다", () => {
    const { container } = render(
      <CameraPreviewSurface stream={null} facing="front" videoRef={videoRef()} />,
    );
    const className = container.querySelector("video")?.className;

    if (PREVIEW_OBJECT_FIT === "contain") {
      expect(className).toContain("object-contain");
      expect(className).not.toContain("object-cover");
      // 상단 정렬이라야 남는 공간이 아래로 모여 순공 타이머·캡션·컨트롤 바가 그 자리를 쓴다.
      // 가운데 정렬이면 위아래로 쪼개져 어느 쪽도 UI가 쓸 만한 크기가 안 된다.
      expect(className).toContain("object-top");
    } else {
      expect(className).toContain("object-cover");
      expect(className).not.toContain("object-contain");
    }
  });

  it("전면 카메라는 거울처럼 좌우를 반전한다", () => {
    const { container } = render(
      <CameraPreviewSurface stream={null} facing="front" videoRef={videoRef()} />,
    );

    expect(container.querySelector("video")?.className).toContain("scale-x-[-1]");
  });

  it("후면 카메라는 반전하지 않는다 — 실제 장면과 좌우가 뒤집히면 안 된다", () => {
    const { container } = render(
      <CameraPreviewSurface stream={null} facing="back" videoRef={videoRef()} />,
    );

    expect(container.querySelector("video")?.className).not.toContain("scale-x-[-1]");
  });
});
