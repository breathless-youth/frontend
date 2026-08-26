import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RemoteVideo } from "../components/RemoteVideo";

function fakeTrack(overrides: Partial<MediaStreamTrack> = {}): MediaStreamTrack {
  return { readyState: "live", muted: false, ...overrides } as unknown as MediaStreamTrack;
}

function fakeStream(track: MediaStreamTrack): MediaStream {
  return { getVideoTracks: () => [track] } as unknown as MediaStream;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("RemoteVideo — 수신 렌더 정지 자가 치유", () => {
  it("트랙이 살아 있는데 프레임이 4초 정체되면 srcObject를 재장착하고 play를 다시 건다", () => {
    // Chrome/Android WebView는 프레임을 받고도 기존 엘리먼트에 렌더하지 않을 수 있다
    // (twilio-video#931 계열 — 2026-08-26 실기기: 배경 복귀 송신자의 영상이 수신측에서만
    // 검은 화면). 재장착이 디코더-엘리먼트 결합을 새로 만든다.
    vi.useFakeTimers();
    const stream = fakeStream(fakeTrack());
    render(<RemoteVideo userId={8} stream={stream} />);
    const video = screen.getByTestId("remote-video-8") as HTMLVideoElement;

    let srcObject: unknown = stream;
    let assigns = 0;
    Object.defineProperty(video, "srcObject", {
      configurable: true,
      get: () => srcObject,
      set(value: unknown) {
        srcObject = value;
        assigns += 1;
      },
    });
    video.getVideoPlaybackQuality = () =>
      ({ totalVideoFrames: 42 }) as unknown as VideoPlaybackQuality;
    const play = vi.spyOn(window.HTMLMediaElement.prototype, "play");

    vi.advanceTimersByTime(2000); // 1차 측정(42) — 기준값 저장
    vi.advanceTimersByTime(2000); // 정체 1틱
    expect(assigns).toBe(0);

    vi.advanceTimersByTime(2000); // 정체 2틱 → 재장착
    expect(assigns).toBe(2); // null → stream
    expect(video.srcObject).toBe(stream);
    expect(play).toHaveBeenCalled();
  });

  it("muted 트랙(프레임이 정말 없음)은 재장착하지 않는다 — 오탐 방지", () => {
    vi.useFakeTimers();
    const stream = fakeStream(fakeTrack({ muted: true }));
    render(<RemoteVideo userId={8} stream={stream} />);
    const video = screen.getByTestId("remote-video-8") as HTMLVideoElement;

    let assigns = 0;
    Object.defineProperty(video, "srcObject", {
      configurable: true,
      get: () => stream,
      set() {
        assigns += 1;
      },
    });
    video.getVideoPlaybackQuality = () =>
      ({ totalVideoFrames: 42 }) as unknown as VideoPlaybackQuality;

    vi.advanceTimersByTime(10_000);
    expect(assigns).toBe(0);
  });

  it("프레임이 계속 늘면(정상 수신·검은 프레임 포함) 재장착하지 않는다", () => {
    vi.useFakeTimers();
    const stream = fakeStream(fakeTrack());
    render(<RemoteVideo userId={8} stream={stream} />);
    const video = screen.getByTestId("remote-video-8") as HTMLVideoElement;

    let assigns = 0;
    Object.defineProperty(video, "srcObject", {
      configurable: true,
      get: () => stream,
      set() {
        assigns += 1;
      },
    });
    let frames = 0;
    video.getVideoPlaybackQuality = () => {
      frames += 30;
      return { totalVideoFrames: frames } as unknown as VideoPlaybackQuality;
    };

    vi.advanceTimersByTime(10_000);
    expect(assigns).toBe(0);
  });
});
