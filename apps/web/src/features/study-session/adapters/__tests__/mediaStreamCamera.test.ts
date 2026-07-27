import { afterEach, describe, expect, it, vi } from "vitest";

import { createMediaStreamCameraAdapter } from "../mediaStreamCamera";

function fakeStream() {
  const track = { stop: vi.fn() };
  return { getTracks: () => [track], __track: track } as unknown as MediaStream & {
    __track: { stop: ReturnType<typeof vi.fn> };
  };
}

function stubMediaDevices(getUserMedia: ReturnType<typeof vi.fn>, deviceKinds: string[] = []) {
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia,
      enumerateDevices: vi.fn(async () => deviceKinds.map((kind) => ({ kind }))),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createMediaStreamCameraAdapter", () => {
  it("start가 전면 카메라로 스트림을 얻고 isRunning을 켠다", async () => {
    const stream = fakeStream();
    const getUserMedia = vi.fn(async () => stream);
    stubMediaDevices(getUserMedia);
    const camera = createMediaStreamCameraAdapter();

    await camera.start();

    expect(camera.isRunning).toBe(true);
    expect(camera.facing).toBe("front");
    expect(camera.stream).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: expect.objectContaining({ facingMode: "user" }) }),
    );
  });

  it("권한 거부로 start가 실패하면 isRunning이 꺼진 채 남는다", async () => {
    stubMediaDevices(vi.fn(async () => Promise.reject(new Error("NotAllowedError"))));
    const camera = createMediaStreamCameraAdapter();

    await camera.start();

    expect(camera.isRunning).toBe(false);
    expect(camera.stream).toBeNull();
  });

  it("stop이 모든 트랙을 멈추고 스트림을 놓는다", async () => {
    const stream = fakeStream();
    stubMediaDevices(vi.fn(async () => stream));
    const camera = createMediaStreamCameraAdapter();

    await camera.start();
    camera.stop();

    expect(stream.__track.stop).toHaveBeenCalled();
    expect(camera.isRunning).toBe(false);
    expect(camera.stream).toBeNull();
  });

  it("flip이 후면으로 바꾸고 옛 스트림을 정리한다", async () => {
    const first = fakeStream();
    const second = fakeStream();
    const getUserMedia = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    stubMediaDevices(getUserMedia, ["videoinput", "videoinput"]);
    const camera = createMediaStreamCameraAdapter();

    await camera.start();
    await expect(camera.flip()).resolves.toEqual({ ok: true, facing: "back" });

    expect(first.__track.stop).toHaveBeenCalled();
    expect(camera.stream).toBe(second);
  });

  it("카메라가 하나뿐이면 flip이 no-alternative로 실패하고 기존 스트림을 유지한다", async () => {
    const stream = fakeStream();
    stubMediaDevices(
      vi.fn(async () => stream),
      ["videoinput"],
    );
    const camera = createMediaStreamCameraAdapter();

    await camera.start();

    await expect(camera.flip()).resolves.toEqual({ ok: false, reason: "no-alternative" });
    expect(camera.stream).toBe(stream);
    expect(stream.__track.stop).not.toHaveBeenCalled();
  });

  it("카메라가 꺼져 있으면 flip이 camera-off로 실패한다", async () => {
    stubMediaDevices(vi.fn(), ["videoinput", "videoinput"]);
    const camera = createMediaStreamCameraAdapter();

    await expect(camera.flip()).resolves.toEqual({ ok: false, reason: "camera-off" });
  });
});
