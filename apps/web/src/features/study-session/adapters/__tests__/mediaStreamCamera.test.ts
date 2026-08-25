import { afterEach, describe, expect, it, vi } from "vitest";

import { visionDiagnostics } from "../../vision/diagnostics";
import type * as DiagnosticsModule from "../../vision/diagnostics";
import { createMediaStreamCameraAdapter } from "../mediaStreamCamera";

vi.mock("../../vision/diagnostics", async (importOriginal) => {
  const actual = await importOriginal<typeof DiagnosticsModule>();
  return {
    ...actual,
    visionDiagnostics: { ...actual.visionDiagnostics, cameraStream: vi.fn() },
  };
});

function fakeStream() {
  const track = { stop: vi.fn() };
  return { getTracks: () => [track], __track: track } as unknown as MediaStream & {
    __track: { stop: ReturnType<typeof vi.fn> };
  };
}

/**
 * `getSettings()`까지 갖춘 스트림. 위 `fakeStream`은 일부러 그대로 둔다 — 진단이 부분 구현
 * 스트림에서도 카메라를 죽이지 않는다는 것 자체가 계약이고, 기존 테스트가 그 경로를 계속 밟는다.
 */
function fakeStreamWithSettings(settings: MediaTrackSettings) {
  const track = { stop: vi.fn(), getSettings: () => settings };
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
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
  // 모듈 스코프 mock(`visionDiagnostics.cameraStream`)이라 호출 기록이 테스트 간 누적된다.
  vi.clearAllMocks();
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

  it("flip은 새 카메라를 열기 전에 기존 스트림을 먼저 정지한다 — Android는 기존 카메라를 놓아야 반대 카메라가 열린다", async () => {
    const order: string[] = [];
    const first = fakeStream();
    first.__track.stop.mockImplementation(() => order.push("stop"));
    const second = fakeStream();
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      const facingMode = (constraints.video as MediaTrackConstraints).facingMode;
      order.push(`open-${String(facingMode)}`);
      return facingMode === "user" ? first : second;
    });
    stubMediaDevices(getUserMedia, ["videoinput", "videoinput"]);
    const camera = createMediaStreamCameraAdapter();

    await camera.start();
    await camera.flip();

    expect(order).toEqual(["open-user", "stop", "open-environment"]);
  });

  it("카메라가 둘이지만 대체 카메라를 열지 못하면 이전 카메라를 복원하고 no-alternative로 실패한다", async () => {
    const first = fakeStream();
    const restored = fakeStream();
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("NotReadableError"))
      .mockResolvedValueOnce(restored);
    stubMediaDevices(getUserMedia, ["videoinput", "videoinput"]);
    const camera = createMediaStreamCameraAdapter();

    await camera.start();

    await expect(camera.flip()).resolves.toEqual({ ok: false, reason: "no-alternative" });
    expect(first.__track.stop).toHaveBeenCalled();
    expect(camera.stream).toBe(restored);
    expect(camera.facing).toBe("front");
    expect(camera.isRunning).toBe(true);
  });

  it("복원 첫 시도가 실패하면 잠깐 뒤 한 번 더 복원한다 — 방금 정지한 카메라의 해제 지연 대비", async () => {
    vi.useFakeTimers();
    try {
      const first = fakeStream();
      const restored = fakeStream();
      const getUserMedia = vi
        .fn()
        .mockResolvedValueOnce(first)
        .mockRejectedValueOnce(new Error("NotReadableError"))
        .mockRejectedValueOnce(new Error("NotReadableError"))
        .mockResolvedValueOnce(restored);
      stubMediaDevices(getUserMedia, ["videoinput", "videoinput"]);
      const camera = createMediaStreamCameraAdapter();
      await camera.start();

      const flipping = camera.flip();
      await vi.advanceTimersByTimeAsync(700);

      await expect(flipping).resolves.toEqual({ ok: false, reason: "no-alternative" });
      expect(camera.stream).toBe(restored);
      expect(camera.facing).toBe("front");
    } finally {
      vi.useRealTimers();
    }
  });

  it("복원까지 모두 실패하면 camera-off로 끝난다", async () => {
    vi.useFakeTimers();
    try {
      const first = fakeStream();
      const getUserMedia = vi
        .fn()
        .mockResolvedValueOnce(first)
        .mockRejectedValue(new Error("NotReadableError"));
      stubMediaDevices(getUserMedia, ["videoinput", "videoinput"]);
      const camera = createMediaStreamCameraAdapter();
      await camera.start();

      const flipping = camera.flip();
      await vi.advanceTimersByTimeAsync(700);

      await expect(flipping).resolves.toEqual({ ok: false, reason: "camera-off" });
      expect(camera.isRunning).toBe(false);
    } finally {
      vi.useRealTimers();
    }
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

  /**
   * 프리뷰가 `object-contain`이라 **실제로 받은 비율이 그대로 여백 크기**가 된다. 그런데
   * `CAMERA_CONSTRAINTS`는 `ideal`이라 요청대로 온다는 보장이 없고, 이 값을 읽는 곳이 여태
   * 없어서 "왜 이렇게 보이는지"를 설명할 근거가 없었다(2026-07-29 크롭 조사).
   */
  describe("스트림 해상도 진단", () => {
    it("실제로 열린 트랙 설정을 남긴다 — 요청값이 아니라 받은 값이다", async () => {
      // 720×1280(9:16)을 요청하지만 센서 네이티브인 4:3으로 돌아오는, 실제로 흔한 상황.
      stubMediaDevices(
        vi.fn(async () => fakeStreamWithSettings({ width: 480, height: 640, facingMode: "user" })),
      );

      await createMediaStreamCameraAdapter().start();

      expect(visionDiagnostics.cameraStream).toHaveBeenCalledWith({
        width: 480,
        height: 640,
        // 트랙이 aspectRatio를 안 줬으므로 계산해서 채운다.
        aspectRatio: 0.75,
        facingMode: "user",
      });
    });

    it("카메라 전환도 새로 여는 것이므로 각각 남는다", async () => {
      stubMediaDevices(
        vi
          .fn()
          .mockResolvedValueOnce(
            fakeStreamWithSettings({ width: 480, height: 640, facingMode: "user" }),
          )
          .mockResolvedValueOnce(
            fakeStreamWithSettings({ width: 720, height: 1280, facingMode: "environment" }),
          ),
        ["videoinput", "videoinput"],
      );
      const camera = createMediaStreamCameraAdapter();

      await camera.start();
      await camera.flip();

      expect(visionDiagnostics.cameraStream).toHaveBeenCalledTimes(2);
      expect(visionDiagnostics.cameraStream).toHaveBeenLastCalledWith(
        expect.objectContaining({ width: 720, height: 1280, facingMode: "environment" }),
      );
    });

    /**
     * 진단이 기능을 죽이면 안 된다 — 여기서 던지면 `open()`이 통째로 실패해 **카메라가 아예
     * 안 켜진다.** 부분 구현 스트림(`fakeStream`)은 `getVideoTracks`가 없다.
     */
    it("트랙 설정을 읽을 수 없어도 카메라는 정상적으로 켜진다", async () => {
      stubMediaDevices(vi.fn(async () => fakeStream()));
      const camera = createMediaStreamCameraAdapter();

      await camera.start();

      expect(camera.isRunning).toBe(true);
      expect(visionDiagnostics.cameraStream).not.toHaveBeenCalled();
    });
  });
});
