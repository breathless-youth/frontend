import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClonedTrackPreview } from "../components/ClonedTrackPreview";
import { RemoteVideo } from "../components/RemoteVideo";

/**
 * 세션 영상 공통 계약 — iOS 네이티브 재생/일시정지 컨트롤 차단.
 * 재생은 autoplay 속성에 맡기지 않고 직접 걸고(저전력 모드의 autoplay 무시 대응),
 * 탭은 영상에 닿지 않게 한다(탭이 닿으면 컨트롤이 뜬다).
 */
describe("RemoteVideo", () => {
  it("스트림이 붙으면 재생을 직접 걸고, 탭을 받지 않는다", () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const stream = { getVideoTracks: () => [] } as unknown as MediaStream;

    const { getByTestId } = render(<RemoteVideo userId={9} stream={stream} />);

    const video = getByTestId("remote-video-9");
    expect(video).toHaveClass("pointer-events-none", "session-video");
    expect((video as HTMLVideoElement).srcObject).toBe(stream);
    expect(playSpy).toHaveBeenCalledTimes(1);
    // 재생은 킥이 건다 — autoplay 속성은 iOS 저전력 모드에서 숨길 수 없는 네이티브
    // 컨트롤을 발동시키므로 달지 않는다.
    expect(video).not.toHaveAttribute("autoplay");
  });

  it("재생이 멈추는 신호(suspend·pause)가 오면 다시 건다 — 첫 play() 거부에 대비한다", () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const stream = { getVideoTracks: () => [] } as unknown as MediaStream;
    const { getByTestId } = render(<RemoteVideo userId={9} stream={stream} />);
    const video = getByTestId("remote-video-9");
    playSpy.mockClear();

    fireEvent.loadedMetadata(video);
    fireEvent.suspend(video);
    fireEvent.pause(video);

    expect(playSpy).toHaveBeenCalledTimes(3);
  });
});

describe("ClonedTrackPreview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("복제 트랙이 붙으면 재생을 직접 걸고, 탭을 받지 않는다", () => {
    class FakeMediaStream {
      tracks: unknown[];
      constructor(tracks: unknown[]) {
        this.tracks = tracks;
      }
      getVideoTracks() {
        return this.tracks;
      }
    }
    vi.stubGlobal("MediaStream", FakeMediaStream);
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const clone = { enabled: false, stop: vi.fn() };
    const track = { enabled: true, clone: () => clone };
    const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;

    const { getByTestId } = render(<ClonedTrackPreview stream={stream} facing="front" />);

    expect(getByTestId("camera-dialog-preview")).toHaveClass(
      "pointer-events-none",
      "session-video",
    );
    expect(getByTestId("camera-dialog-preview")).not.toHaveAttribute("autoplay");
    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});
