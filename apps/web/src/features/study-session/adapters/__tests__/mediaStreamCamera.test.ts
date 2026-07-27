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

  it("카메라가 둘이지만 대체 카메라를 열지 못하면 flip이 no-alternative로 실패하고 기존 스트림을 유지한다", async () => {
    const first = fakeStream();
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("NotReadableError"));
    stubMediaDevices(getUserMedia, ["videoinput", "videoinput"]);
    const camera = createMediaStreamCameraAdapter();

    await camera.start();

    await expect(camera.flip()).resolves.toEqual({ ok: false, reason: "no-alternative" });
    expect(camera.stream).toBe(first);
    expect(camera.facing).toBe("front");
    expect(first.__track.stop).not.toHaveBeenCalled();
  });

  it("카메라가 꺼져 있으면 flip이 camera-off로 실패한다", async () => {
    stubMediaDevices(vi.fn(), ["videoinput", "videoinput"]);
    const camera = createMediaStreamCameraAdapter();

    await expect(camera.flip()).resolves.toEqual({ ok: false, reason: "camera-off" });
  });

  // 권한 프롬프트가 떠 있는 동안 세션을 떠나는 경로 / StrictMode의 effect 이중 실행 —
  // 둘 다 "getUserMedia가 해결되기 전"이라 stream이 아직 null이고, 가드가 없으면
  // 뒤늦게 도착한 트랙을 아무도 멈추지 않는다.
  describe("진행 중 getUserMedia 보호", () => {
    it("start 도중 stop이 들어오면 뒤늦게 도착한 스트림을 멈추고 붙잡지 않는다", async () => {
      const stream = fakeStream();
      let resolveOpen: (value: MediaStream) => void = () => {};
      stubMediaDevices(vi.fn(() => new Promise<MediaStream>((resolve) => (resolveOpen = resolve))));
      const camera = createMediaStreamCameraAdapter();

      const starting = camera.start();
      camera.stop(); // 아직 stream이 null인 시점 — 예전 구현은 여기서 아무것도 못 멈췄다.
      resolveOpen(stream);
      await starting;

      expect(stream.__track.stop).toHaveBeenCalled();
      expect(camera.stream).toBeNull();
      expect(camera.isRunning).toBe(false);
    });

    it("동시 start 두 번이 getUserMedia를 한 번만 부른다", async () => {
      const stream = fakeStream();
      const getUserMedia = vi.fn(async () => stream);
      stubMediaDevices(getUserMedia);
      const camera = createMediaStreamCameraAdapter();

      await Promise.all([camera.start(), camera.start()]);

      expect(getUserMedia).toHaveBeenCalledTimes(1);
      expect(camera.stream).toBe(stream);
      expect(stream.__track.stop).not.toHaveBeenCalled();
    });

    it("동시 flip 두 번이 카메라를 한 번만 더 열고 고아 스트림을 남기지 않는다", async () => {
      const first = fakeStream();
      const second = fakeStream();
      const getUserMedia = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
      stubMediaDevices(getUserMedia, ["videoinput", "videoinput"]);
      const camera = createMediaStreamCameraAdapter();
      await camera.start();

      const results = await Promise.all([camera.flip(), camera.flip()]);

      expect(getUserMedia).toHaveBeenCalledTimes(2); // start 1 + flip 1
      expect(results).toContainEqual({ ok: true, facing: "back" });
      expect(camera.stream).toBe(second);
      expect(camera.facing).toBe("back");
      expect(first.__track.stop).toHaveBeenCalled();
      expect(second.__track.stop).not.toHaveBeenCalled();
    });

    it("flip 도중 stop이 들어오면 뒤늦게 열린 스트림을 멈추고 붙잡지 않는다", async () => {
      const first = fakeStream();
      const second = fakeStream();
      let resolveFlip: (value: MediaStream) => void = () => {};
      const getUserMedia = vi
        .fn()
        .mockResolvedValueOnce(first)
        .mockImplementationOnce(
          () => new Promise<MediaStream>((resolve) => (resolveFlip = resolve)),
        );
      stubMediaDevices(getUserMedia, ["videoinput", "videoinput"]);
      const camera = createMediaStreamCameraAdapter();
      await camera.start();

      const flipping = camera.flip();
      await Promise.resolve(); // enumerateDevices 통과까지 진행시킨다
      await Promise.resolve();
      camera.stop();
      resolveFlip(second);

      await expect(flipping).resolves.toEqual({ ok: false, reason: "camera-off" });
      expect(first.__track.stop).toHaveBeenCalled();
      expect(second.__track.stop).toHaveBeenCalled();
      expect(camera.stream).toBeNull();
    });
  });
});
