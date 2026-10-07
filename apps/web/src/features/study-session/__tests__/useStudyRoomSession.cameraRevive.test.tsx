import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CameraAdapter, CameraFlipResult } from "../adapters/cameraAdapter";
import { createMockSystemPauseSource } from "../adapters/systemPauseSource";
import { useStudyRoomSession } from "../useStudyRoomSession";

/**
 * Android 웹뷰는 백그라운드에서 카메라 트랙을 끊는다(BY-893). 훅은 복귀·재개·트랙 `ended`에서
 * 어댑터에 다시 잡기를 맡기고, 바뀐 스트림을 화면에 내준다.
 */
function fakeTrack() {
  const listeners = new Set<() => void>();
  return {
    readyState: "live" as MediaStreamTrackState,
    stop: vi.fn(),
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    end() {
      this.readyState = "ended";
      for (const listener of listeners) listener();
    },
  };
}

function fakeStream(track = fakeTrack()) {
  return Object.assign(
    { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream,
    { track },
  );
}

/** `ensureLive`가 미리 정해 둔 스트림(실패면 null)으로 갈아 끼우는 대역. */
function revivableCamera(first: MediaStream) {
  let stream: MediaStream | null = first;
  let next: MediaStream | null = null;
  const camera = {
    facing: "front" as const,
    get isRunning() {
      return stream !== null;
    },
    get stream() {
      return stream;
    },
    // StrictMode가 마운트 effect를 두 번 돌리므로 stop 뒤 start가 다시 열어야 한다.
    start: vi.fn(async () => {
      stream = first;
    }),
    stop: vi.fn(() => {
      stream = null;
    }),
    flip: vi.fn(async (): Promise<CameraFlipResult> => ({ ok: false, reason: "no-alternative" })),
    ensureLive: vi.fn(async () => {
      stream = next;
    }),
    reviveWith(value: MediaStream | null) {
      next = value;
    },
  };
  return camera satisfies CameraAdapter;
}

/**
 * 대기 중인 비동기 작업을 다 흘려보낸다. 훅은 `ensureLive`를 기다린 뒤 state를 바꾸고, 마운트 때
 * `start()` 뒤의 반영도 늦게 돈다. 렌더 직후에도 불러야 그 반영이 뒤늦게 새 스트림을 읽어
 * 재획득 배선 없이 통과하는 일을 막는다.
 */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useStudyRoomSession 카메라 재획득 (BY-893)", () => {
  it("백그라운드에서 돌아오면 카메라를 다시 잡고 새 스트림을 내준다 — 세션은 일시정지 그대로", async () => {
    const first = fakeStream();
    const second = fakeStream();
    const camera = revivableCamera(first);
    camera.reviveWith(second);
    const systemPause = createMockSystemPauseSource();
    const hook = renderHook(() => useStudyRoomSession(null, { camera, systemPause }));
    await settle();

    act(() => systemPause.leave());
    act(() => systemPause.return());
    await settle();

    expect(camera.ensureLive).toHaveBeenCalledTimes(1);
    expect(hook.result.current.cameraStream).toBe(second);
    expect(hook.result.current.sessionState.kind).toBe("PAUSE");
  });

  it("재개할 때도 카메라를 확인한다", async () => {
    const first = fakeStream();
    const camera = revivableCamera(first);
    camera.reviveWith(first);
    const hook = renderHook(() => useStudyRoomSession(null, { camera }));
    await settle();

    act(() => hook.result.current.pause());
    act(() => hook.result.current.resume());
    await settle();

    expect(camera.ensureLive).toHaveBeenCalledTimes(1);
  });

  it("다시 잡지 못하면 카메라를 끄고 onCameraLost를 한 번 부른다", async () => {
    const camera = revivableCamera(fakeStream());
    camera.reviveWith(null);
    const onCameraLost = vi.fn();
    const systemPause = createMockSystemPauseSource();
    const hook = renderHook(() => useStudyRoomSession(null, { camera, systemPause, onCameraLost }));
    await settle();

    act(() => systemPause.leave());
    act(() => systemPause.return());
    await settle();

    expect(onCameraLost).toHaveBeenCalledTimes(1);
    expect(hook.result.current.isCameraRunning).toBe(false);
    expect(hook.result.current.cameraStream).toBeNull();
  });

  it("화면이 보이는 중 트랙이 끊기면 바로 다시 잡는다", async () => {
    const first = fakeStream();
    const second = fakeStream();
    const camera = revivableCamera(first);
    camera.reviveWith(second);
    const hook = renderHook(() => useStudyRoomSession(null, { camera }));
    await settle();

    act(() => first.track.end());
    await settle();

    expect(camera.ensureLive).toHaveBeenCalledTimes(1);
    expect(hook.result.current.cameraStream).toBe(second);
  });

  it("숨은 동안 끊긴 트랙은 복귀에 맡긴다", async () => {
    const first = fakeStream();
    const camera = revivableCamera(first);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    renderHook(() => useStudyRoomSession(null, { camera }));
    await settle();

    act(() => first.track.end());
    await settle();

    expect(camera.ensureLive).not.toHaveBeenCalled();
  });

  it("다시 잡는 중 세션을 떠나면 onCameraLost를 부르지 않는다", async () => {
    const camera = revivableCamera(fakeStream());
    let finish: () => void = () => {};
    camera.ensureLive.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const onCameraLost = vi.fn();
    const systemPause = createMockSystemPauseSource();
    const hook = renderHook(() => useStudyRoomSession(null, { camera, systemPause, onCameraLost }));
    await settle();

    act(() => systemPause.leave());
    act(() => systemPause.return());
    hook.unmount();
    finish();
    await settle();

    expect(onCameraLost).not.toHaveBeenCalled();
  });

  it("카메라를 전환하면 새 스트림을 내준다 — 스트림이 state라 전환도 직접 옮겨야 한다", async () => {
    const front = fakeStream();
    const back = fakeStream();
    const camera = revivableCamera(front);
    camera.flip.mockImplementationOnce(async () => {
      camera.reviveWith(back);
      await camera.ensureLive();
      camera.ensureLive.mockClear();
      return { ok: true, facing: "back" };
    });
    const hook = renderHook(() => useStudyRoomSession(null, { camera }));
    await settle();
    await settle();

    await act(async () => {
      await hook.result.current.flipCamera();
    });

    expect(hook.result.current.cameraStream).toBe(back);
  });

  it("재개 때 다시 잡지 못해도 세션은 이어지고 실패를 알린다", async () => {
    const camera = revivableCamera(fakeStream());
    camera.reviveWith(null);
    const onCameraLost = vi.fn();
    const hook = renderHook(() => useStudyRoomSession(null, { camera, onCameraLost }));
    await settle();

    act(() => hook.result.current.pause());
    act(() => hook.result.current.resume());
    await settle();

    expect(hook.result.current.sessionState.kind).toBe("FOCUS");
    expect(onCameraLost).toHaveBeenCalledTimes(1);
  });

  it("StrictMode에서도 다시 잡은 뒤 카메라를 껐다 켜지 않는다", async () => {
    const first = fakeStream();
    const second = fakeStream();
    const camera = revivableCamera(first);
    camera.reviveWith(second);
    const systemPause = createMockSystemPauseSource();
    const hook = renderHook(() => useStudyRoomSession(null, { camera, systemPause }), {
      wrapper: StrictMode,
    });
    await settle();
    const startsBefore = camera.start.mock.calls.length;

    act(() => systemPause.leave());
    act(() => systemPause.return());
    await settle();

    // 마운트 effect가 다시 돌면 stop·start가 새 스트림을 첫 스트림으로 되돌린다.
    expect(camera.start.mock.calls.length).toBe(startsBefore);
    expect(hook.result.current.cameraStream).toBe(second);
  });
});
