import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { CameraPreviewSurface } from "../components/CameraPreviewSurface";

/**
 * `videoRef`는 이제 **호출부가 소유한다** — 추론(`createVisionFocusDetector`)이 표시와 같은
 * `<video>`를 봐야 프레임 복사가 한 번 줄기 때문이다(설계 §3). 이 컴포넌트는 참조를 받을 뿐
 * MediaPipe를 모른다.
 */
function videoRef() {
  return createRef<HTMLVideoElement>();
}

describe("CameraPreviewSurface", () => {
  it("카메라가 꺼져 있으면 목업 라벨을 보여주고 video를 그리지 않는다", () => {
    const { container } = render(
      <CameraPreviewSurface isRunning={false} stream={null} facing="front" videoRef={videoRef()} />,
    );

    expect(screen.getByText("[ 전 면 카 메 라 프 리 뷰 ]")).toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();
  });

  it("카메라가 켜져 있으면 video를 그리고 목업 라벨을 감춘다", () => {
    const { container } = render(
      <CameraPreviewSurface isRunning stream={null} facing="front" videoRef={videoRef()} />,
    );

    expect(screen.queryByText("[ 전 면 카 메 라 프 리 뷰 ]")).toBeNull();
    expect(container.querySelector("video")).not.toBeNull();
  });

  it("video는 음소거·인라인 재생이다 — 소리를 내거나 전체화면으로 튀면 안 된다", () => {
    const { container } = render(
      <CameraPreviewSurface isRunning stream={null} facing="front" videoRef={videoRef()} />,
    );
    const video = container.querySelector("video");

    expect(video).toHaveAttribute("playsinline");
    expect(video?.muted).toBe(true);
  });

  it("전달된 스트림을 video의 srcObject에 붙인다", () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const { container } = render(
      <CameraPreviewSurface isRunning stream={stream} facing="front" videoRef={videoRef()} />,
    );

    expect(container.querySelector("video")?.srcObject).toBe(stream);
  });

  it("호출부가 넘긴 videoRef에 실제 엘리먼트를 붙인다 — 추론이 이 참조로 프레임을 읽는다", () => {
    const ref = videoRef();
    const { container } = render(
      <CameraPreviewSurface isRunning stream={null} facing="front" videoRef={ref} />,
    );

    expect(ref.current).toBe(container.querySelector("video"));
  });

  it("카메라가 꺼져 있으면 videoRef가 비어 있다 — 그 구간은 프레임 없음으로 다뤄야 한다", () => {
    const ref = videoRef();
    render(<CameraPreviewSurface isRunning={false} stream={null} facing="front" videoRef={ref} />);

    expect(ref.current).toBeNull();
  });

  it("전면 카메라는 거울처럼 좌우를 반전한다", () => {
    const { container } = render(
      <CameraPreviewSurface isRunning stream={null} facing="front" videoRef={videoRef()} />,
    );

    expect(container.querySelector("video")?.className).toContain("scale-x-[-1]");
  });

  it("후면 카메라는 반전하지 않는다 — 실제 장면과 좌우가 뒤집히면 안 된다", () => {
    const { container } = render(
      <CameraPreviewSurface isRunning stream={null} facing="back" videoRef={videoRef()} />,
    );

    expect(container.querySelector("video")?.className).not.toContain("scale-x-[-1]");
  });
});
