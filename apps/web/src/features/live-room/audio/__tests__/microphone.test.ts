import { describe, expect, it, vi } from "vitest";

import { acquireMicTrack, MIC_CONSTRAINTS } from "../microphone";

function fakeTrack() {
  return {
    kind: "audio",
    enabled: true,
    readyState: "live",
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
}

function rejectWith(name: string) {
  return async (): Promise<MediaStream> => {
    throw new DOMException("x", name);
  };
}

describe("acquireMicTrack", () => {
  it("에코 제거, 잡음 억제, 자동 음량을 켜고 영상 없이 요청한다", async () => {
    const track = fakeTrack();
    const getUserMedia = vi.fn(
      async () => ({ getAudioTracks: () => [track] }) as unknown as MediaStream,
    );

    await expect(acquireMicTrack(getUserMedia)).resolves.toEqual({ kind: "ok", track });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: MIC_CONSTRAINTS, video: false });
    expect(MIC_CONSTRAINTS).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });

  it("권한 거절은 denied, 그 밖의 실패는 unavailable이다", async () => {
    await expect(acquireMicTrack(rejectWith("NotAllowedError"))).resolves.toEqual({
      kind: "denied",
    });
    await expect(acquireMicTrack(rejectWith("SecurityError"))).resolves.toEqual({
      kind: "denied",
    });
    await expect(acquireMicTrack(rejectWith("NotFoundError"))).resolves.toEqual({
      kind: "unavailable",
    });
    await expect(acquireMicTrack(rejectWith("NotReadableError"))).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("소리 트랙이 없는 스트림은 unavailable이다", async () => {
    const getUserMedia = async () => ({ getAudioTracks: () => [] }) as unknown as MediaStream;

    await expect(acquireMicTrack(getUserMedia)).resolves.toEqual({ kind: "unavailable" });
  });

  it("브라우저에 mediaDevices가 없으면 unavailable이다", async () => {
    expect(navigator.mediaDevices).toBeUndefined();

    await expect(acquireMicTrack()).resolves.toEqual({ kind: "unavailable" });
  });
});
