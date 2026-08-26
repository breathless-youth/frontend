import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RemoteVideo } from "../components/RemoteVideo";

function fakeTrack(overrides: Partial<MediaStreamTrack> = {}): MediaStreamTrack {
  return { readyState: "live", muted: false, ...overrides } as unknown as MediaStreamTrack;
}

function fakeStream(track: MediaStreamTrack): MediaStream {
  return { getVideoTracks: () => [track] } as unknown as MediaStream;
}

/**
 * jsdom에는 requestVideoFrameCallback이 없다 — 프로토타입에 스텁을 심어 "그려진 프레임"
 * 신호를 테스트가 직접 쏜다. 콜백 배열을 돌려줘 수동 발화(fireFrame)에 쓴다.
 */
function stubVideoFrameCallback() {
  const callbacks: VideoFrameRequestCallback[] = [];
  Object.defineProperty(HTMLVideoElement.prototype, "requestVideoFrameCallback", {
    configurable: true,
    writable: true,
    value(callback: VideoFrameRequestCallback) {
      callbacks.push(callback);
      return callbacks.length;
    },
  });
  Object.defineProperty(HTMLVideoElement.prototype, "cancelVideoFrameCallback", {
    configurable: true,
    writable: true,
    value() {},
  });
  const fireFrame = () => {
    const pending = callbacks.splice(0, callbacks.length);
    for (const callback of pending) {
      callback(0, {} as VideoFrameCallbackMetadata);
    }
  };
  return { fireFrame };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (HTMLVideoElement.prototype as { requestVideoFrameCallback?: unknown })
    .requestVideoFrameCallback;
  delete (HTMLVideoElement.prototype as { cancelVideoFrameCallback?: unknown })
    .cancelVideoFrameCallback;
});

describe("RemoteVideo — 수신 렌더 정지 자가 치유", () => {
  it("트랙이 살아 있는데 4초간 그려진 프레임이 없으면 srcObject를 재장착하고 play를 다시 건다", () => {
    // Chrome/Android WebView는 프레임을 받고도 기존 엘리먼트에 렌더하지 않을 수 있다
    // (twilio-video#931 계열 — 2026-08-26 실기기: 배경 복귀 송신자의 영상이 수신측에서만
    // 검은 화면). rVFC가 침묵하면 재장착이 디코더-엘리먼트 결합을 새로 만든다.
    vi.useFakeTimers();
    stubVideoFrameCallback();
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
    const play = vi.spyOn(window.HTMLMediaElement.prototype, "play");

    vi.advanceTimersByTime(2000); // 마지막 프레임 후 2초 — 아직 대기
    expect(assigns).toBe(0);

    vi.advanceTimersByTime(2000); // 4초 정체 → 재장착
    expect(assigns).toBe(2); // null → stream
    expect(video.srcObject).toBe(stream);
    expect(play).toHaveBeenCalled();
  });

  it("프레임이 계속 그려지면 재장착하지 않는다 — 프레임 카운터 오탐(전체 깜빡임) 회귀 가드", () => {
    // getVideoPlaybackQuality 폴링 시절, 일부 기기에서 WebRTC 프레임 카운터가 갱신되지
    // 않아 멀쩡한 화면을 4초마다 재장착했다(2026-08-26 실기기: 전체 타일 깜빡임). rVFC는
    // 실제로 그려진 프레임마다 불리므로 정상 재생에서 절대 침묵하지 않는다.
    vi.useFakeTimers();
    const { fireFrame } = stubVideoFrameCallback();
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

    for (let i = 0; i < 5; i += 1) {
      vi.advanceTimersByTime(2000);
      fireFrame();
    }
    expect(assigns).toBe(0);
  });

  it("muted 트랙(프레임이 정말 없음)은 재장착하지 않는다 — 오탐 방지", () => {
    vi.useFakeTimers();
    stubVideoFrameCallback();
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

    vi.advanceTimersByTime(10_000);
    expect(assigns).toBe(0);
  });
});
