import { beforeEach, describe, expect, it, vi } from "vitest";

import { acquireMicTrack, MIC_CONSTRAINTS } from "../microphone";

const reportHandled = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sentry", () => ({ reportHandled }));

beforeEach(() => {
  reportHandled.mockReset();
});

function fakeTrack() {
  return {
    kind: "audio",
    enabled: true,
    readyState: "live",
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
}

function rejectWith(name: string, message = "x") {
  return async (): Promise<MediaStream> => {
    throw new DOMException(message, name);
  };
}

/** 보고된 오류의 이름과 태그 */
function reports() {
  return reportHandled.mock.calls.map(([error, tag]) => [(error as Error).name, tag]);
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

  it("거절이 아닌 실패는 메시지 없이 오류 이름만 보고한다", async () => {
    await acquireMicTrack(rejectWith("NotReadableError", "Built-in Microphone is busy"));

    expect(reports()).toEqual([["NotReadableError", "mic-acquire"]]);
    const [reported] = reportHandled.mock.calls[0] as [Error, string];
    expect(reported.message).not.toContain("Built-in");
  });

  it("권한 거절은 보고하지 않는다", async () => {
    await acquireMicTrack(rejectWith("NotAllowedError"));
    await acquireMicTrack(rejectWith("SecurityError"));

    expect(reportHandled).not.toHaveBeenCalled();
  });

  it("소리 트랙이 없거나 mediaDevices가 없어도 무엇이 없었는지 이름으로 보고한다", async () => {
    await acquireMicTrack(async () => ({ getAudioTracks: () => [] }) as unknown as MediaStream);
    await acquireMicTrack();

    expect(reports()).toEqual([
      ["NoAudioTrack", "mic-acquire"],
      ["NoMediaDevices", "mic-acquire"],
    ]);
  });

  it("이미 끝난 트랙을 받으면 unavailable이고 끝났다고 보고한다", async () => {
    const ended = { ...fakeTrack(), readyState: "ended" } as unknown as MediaStreamTrack;
    const getUserMedia = async () => ({ getAudioTracks: () => [ended] }) as unknown as MediaStream;

    await expect(acquireMicTrack(getUserMedia)).resolves.toEqual({ kind: "unavailable" });
    expect(reports()).toEqual([["AudioTrackEnded", "mic-acquire"]]);
  });
});
