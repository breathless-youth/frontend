import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CameraPreviewSurface } from "../components/CameraPreviewSurface";

describe("CameraPreviewSurface", () => {
  it("카메라가 꺼져 있으면 목업 라벨을 보여주고 video를 그리지 않는다", () => {
    const { container } = render(<CameraPreviewSurface isRunning={false} stream={null} />);

    expect(screen.getByText("[ 전 면 카 메 라 프 리 뷰 ]")).toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();
  });

  it("카메라가 켜져 있으면 video를 그리고 목업 라벨을 감춘다", () => {
    const { container } = render(<CameraPreviewSurface isRunning stream={null} />);

    expect(screen.queryByText("[ 전 면 카 메 라 프 리 뷰 ]")).toBeNull();
    expect(container.querySelector("video")).not.toBeNull();
  });

  it("video는 음소거·인라인 재생이다 — 소리를 내거나 전체화면으로 튀면 안 된다", () => {
    const { container } = render(<CameraPreviewSurface isRunning stream={null} />);
    const video = container.querySelector("video");

    expect(video).toHaveAttribute("playsinline");
    expect(video?.muted).toBe(true);
  });

  it("전달된 스트림을 video의 srcObject에 붙인다", () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const { container } = render(<CameraPreviewSurface isRunning stream={stream} />);

    expect(container.querySelector("video")?.srcObject).toBe(stream);
  });
});
