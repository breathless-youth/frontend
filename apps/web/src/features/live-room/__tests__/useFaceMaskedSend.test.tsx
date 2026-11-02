import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import type { VisionDetectorStatus } from "@/features/study-session/adapters/focusDetector";
import type { FaceSpot } from "@/features/study-session/vision/faceSpot";

import type { FaceMaskedStream } from "../faceMaskedStream";
import { FACE_MASK_EMOJIS } from "../faceMaskSettings";
import { useFaceMaskedSend, useKeepMaskSourceLive } from "../useFaceMaskedSend";

const mocks = vi.hoisted(() => ({ toggled: vi.fn(), emojiSelected: vi.fn() }));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackSocialRoomFaceMaskToggled: mocks.toggled,
  trackSocialRoomFaceMaskEmojiSelected: mocks.emojiSelected,
}));

function fakeCompositor() {
  const stream = { id: "masked" } as unknown as MediaStream;
  const compositor: FaceMaskedStream = {
    stream,
    setSpot: vi.fn(),
    setSticker: vi.fn(),
    start: vi.fn(),
    pause: vi.fn(),
    dispose: vi.fn(),
    stats: () => ({ height: 360, fps: 15, videoMs: 1, stickerMs: 0 }),
  };
  return compositor;
}

function fakeDetector(initialFaceStatus: VisionDetectorStatus = "ready") {
  let listener: ((spot: FaceSpot | null) => void) | null = null;
  let faceStatus = initialFaceStatus;
  const statusListeners = new Set<(status: VisionDetectorStatus) => void>();
  return {
    subscribeFaceSpot: vi.fn((next: (spot: FaceSpot | null) => void) => {
      listener = next;
      return () => {
        listener = null;
      };
    }),
    get faceStatus() {
      return faceStatus;
    },
    subscribeFaceStatus: (next: (status: VisionDetectorStatus) => void) => {
      statusListeners.add(next);
      return () => {
        statusListeners.delete(next);
      };
    },
    preload: vi.fn(),
    emit: (spot: FaceSpot | null) => listener?.(spot),
    setFaceStatus(next: VisionDetectorStatus) {
      faceStatus = next;
      for (const notify of [...statusListeners]) {
        notify(next);
      }
    },
  };
}

const spotA: FaceSpot = { x: 0.5, y: 0.4, size: 0.2, aspect: 16 / 9, visible: true };

const camera = { id: "camera" } as unknown as MediaStream;
const sourceRef = { current: null };

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("useFaceMaskedSend", () => {
  it("켜 둔 선택이 저장돼 있으면 합성 스트림을 보내고 합성을 시작한다", () => {
    localStorage.setItem("focusmakers.socialFaceMask", "on");
    const compositor = fakeCompositor();
    const detector = fakeDetector();
    const { result } = renderHook(() =>
      useFaceMaskedSend({
        sourceRef,
        visionDetector: detector,
        cameraStream: camera,
        active: true,
        createCompositor: () => compositor,
      }),
    );
    expect(result.current.supported).toBe(true);
    expect(result.current.on).toBe(true);
    expect(result.current.sendStream).toBe(compositor.stream);
    expect(result.current.maskedStream).toBe(compositor.stream);
    expect(compositor.start).toHaveBeenCalled();
  });

  it("끄면 원본을 보내고 합성을 멈추며 선택을 저장한다", () => {
    localStorage.setItem("focusmakers.socialFaceMask", "on");
    const compositor = fakeCompositor();
    const detector = fakeDetector();
    const { result } = renderHook(() =>
      useFaceMaskedSend({
        sourceRef,
        visionDetector: detector,
        cameraStream: camera,
        active: true,
        createCompositor: () => compositor,
      }),
    );
    act(() => result.current.setOn(false));
    expect(result.current.on).toBe(false);
    expect(result.current.sendStream).toBe(camera);
    expect(compositor.pause).toHaveBeenCalled();
    expect(localStorage.getItem("focusmakers.socialFaceMask")).toBe("off");
    expect(mocks.toggled).toHaveBeenCalledWith(false);
  });

  it("저장된 선택이 꺼짐이면 원본을 보내고 합성을 시작하지 않는다", () => {
    localStorage.setItem("focusmakers.socialFaceMask", "off");
    const compositor = fakeCompositor();
    const detector = fakeDetector();
    const { result } = renderHook(() =>
      useFaceMaskedSend({
        sourceRef,
        visionDetector: detector,
        cameraStream: camera,
        active: true,
        createCompositor: () => compositor,
      }),
    );
    expect(result.current.sendStream).toBe(camera);
    expect(compositor.start).not.toHaveBeenCalled();
  });

  it("합성기를 만들 수 없으면 미지원이고 원본을 보낸다", () => {
    const detector = fakeDetector();
    const { result } = renderHook(() =>
      useFaceMaskedSend({
        sourceRef,
        visionDetector: detector,
        cameraStream: camera,
        active: true,
        createCompositor: () => null,
      }),
    );
    expect(result.current.supported).toBe(false);
    expect(result.current.on).toBe(false);
    expect(result.current.maskedStream).toBeNull();
    expect(result.current.sendStream).toBe(camera);
    expect(detector.preload).not.toHaveBeenCalled();
  });

  it("카메라가 없으면 보낼 스트림도 없다", () => {
    const detector = fakeDetector();
    const { result } = renderHook(() =>
      useFaceMaskedSend({
        sourceRef,
        visionDetector: detector,
        cameraStream: null,
        active: true,
        createCompositor: () => fakeCompositor(),
      }),
    );
    expect(result.current.sendStream).toBeNull();
    expect(detector.preload).not.toHaveBeenCalled();
  });

  it("감지기 자리를 합성기에 넘기고, 카메라가 있으면 모델을 미리 준비한다", () => {
    const compositor = fakeCompositor();
    const detector = fakeDetector();
    const { result } = renderHook(() =>
      useFaceMaskedSend({
        sourceRef,
        visionDetector: detector,
        cameraStream: camera,
        active: true,
        createCompositor: () => compositor,
      }),
    );
    const spot: FaceSpot = { x: 0.5, y: 0.4, size: 0.2, aspect: 16 / 9, visible: true };
    act(() => detector.emit(spot));
    expect(result.current.faceSpot).toBe(spot);
    expect(compositor.setSpot).toHaveBeenLastCalledWith(spot);
    expect(detector.preload).toHaveBeenCalled();
  });

  it("얼굴 모델이 준비되기 전에는 자리가 와도 흐림을 유지한다", () => {
    const compositor = fakeCompositor();
    const detector = fakeDetector("loading");
    const { result } = renderHook(() =>
      useFaceMaskedSend({
        sourceRef,
        visionDetector: detector,
        cameraStream: camera,
        active: true,
        createCompositor: () => compositor,
      }),
    );
    act(() => detector.emit(spotA));
    expect(result.current.faceSpot).toBeNull();
    expect(compositor.setSpot).toHaveBeenLastCalledWith(null);
    expect(compositor.setSpot).not.toHaveBeenCalledWith(spotA);

    act(() => detector.setFaceStatus("ready"));
    expect(result.current.faceSpot).toBe(spotA);
    expect(compositor.setSpot).toHaveBeenLastCalledWith(spotA);

    act(() => detector.setFaceStatus("unavailable"));
    expect(result.current.faceSpot).toBeNull();
    expect(compositor.setSpot).toHaveBeenLastCalledWith(null);
  });

  it("카메라 스트림이 바뀌면 새 자리가 올 때까지 흐림으로 돌아간다", () => {
    const compositor = fakeCompositor();
    const detector = fakeDetector();
    const { result, rerender } = renderHook(
      ({ stream }: { stream: MediaStream | null }) =>
        useFaceMaskedSend({
          sourceRef,
          visionDetector: detector,
          cameraStream: stream,
          active: true,
          createCompositor: () => compositor,
        }),
      { initialProps: { stream: camera } },
    );
    act(() => detector.emit(spotA));
    expect(compositor.setSpot).toHaveBeenLastCalledWith(spotA);

    rerender({ stream: { id: "camera-back" } as unknown as MediaStream });
    expect(result.current.faceSpot).toBeNull();
    expect(compositor.setSpot).toHaveBeenLastCalledWith(null);
  });

  it("고른 이모지를 합성기에 넘기고 저장한다", () => {
    const compositor = fakeCompositor();
    const detector = fakeDetector();
    const { result } = renderHook(() =>
      useFaceMaskedSend({
        sourceRef,
        visionDetector: detector,
        cameraStream: camera,
        active: true,
        createCompositor: () => compositor,
      }),
    );
    expect(compositor.setSticker).toHaveBeenCalledTimes(1);
    act(() => result.current.setEmojiId("cat"));
    expect(result.current.emojiId).toBe("cat");
    expect(compositor.setSticker).toHaveBeenLastCalledWith("/face-mask/cat.png");
    expect(localStorage.getItem("focusmakers.socialFaceMaskEmoji")).toBe("cat");
    expect(mocks.emojiSelected).toHaveBeenCalledWith("cat");
  });

  it("목록에 없는 이모지를 고르면 첫 번째 이모지로 맞춘다", () => {
    const compositor = fakeCompositor();
    const detector = fakeDetector();
    const { result } = renderHook(() =>
      useFaceMaskedSend({
        sourceRef,
        visionDetector: detector,
        cameraStream: camera,
        active: true,
        createCompositor: () => compositor,
      }),
    );
    const first = FACE_MASK_EMOJIS[0]!.id;
    act(() => result.current.setEmojiId("removed-emoji"));
    expect(result.current.emojiId).toBe(first);
    expect(localStorage.getItem("focusmakers.socialFaceMaskEmoji")).toBe(first);
    expect(mocks.emojiSelected).toHaveBeenCalledWith(first);
  });

  it("합성기를 만들기 전 첫 렌더에도 켜 둔 선택이면 원본을 보내지 않는다", () => {
    localStorage.setItem("focusmakers.socialFaceMask", "on");
    const compositor = fakeCompositor();
    const detector = fakeDetector();
    const sent: (MediaStream | null)[] = [];
    renderHook(() => {
      const send = useFaceMaskedSend({
        sourceRef,
        visionDetector: detector,
        cameraStream: camera,
        active: true,
        createCompositor: () => compositor,
      });
      sent.push(send.sendStream);
      return send;
    });
    expect(sent).not.toContain(camera);
    expect(sent.at(-1)).toBe(compositor.stream);
  });

  it("가리는 중에 언마운트하면 그리기를 멈추고 합성기를 해제한다", () => {
    localStorage.setItem("focusmakers.socialFaceMask", "on");
    const compositor = fakeCompositor();
    const detector = fakeDetector();
    const { unmount } = renderHook(() =>
      useFaceMaskedSend({
        sourceRef,
        visionDetector: detector,
        cameraStream: camera,
        active: true,
        createCompositor: () => compositor,
      }),
    );
    expect(compositor.start).toHaveBeenCalled();
    expect(compositor.dispose).not.toHaveBeenCalled();
    unmount();
    expect(compositor.pause).toHaveBeenCalled();
    expect(compositor.dispose).toHaveBeenCalledTimes(1);
  });

  it("StrictMode 재마운트에서도 해제되지 않은 합성기를 쓴다", () => {
    localStorage.setItem("focusmakers.socialFaceMask", "on");
    const created: FaceMaskedStream[] = [];
    const detector = fakeDetector();
    const { result } = renderHook(
      () =>
        useFaceMaskedSend({
          sourceRef,
          visionDetector: detector,
          cameraStream: camera,
          active: true,
          createCompositor: () => {
            const compositor = fakeCompositor();
            created.push(compositor);
            return compositor;
          },
        }),
      { wrapper: StrictMode },
    );
    const live = created.at(-1)!;
    expect(live.dispose).not.toHaveBeenCalled();
    expect(result.current.sendStream).toBe(live.stream);
    expect(live.start).toHaveBeenCalled();
    for (const disposed of created.slice(0, -1)) {
      expect(disposed.dispose).toHaveBeenCalled();
    }
  });

  it("카메라도 꺼져 있고 켜기 창도 닫혀 있으면 그리지 않는다", () => {
    localStorage.setItem("focusmakers.socialFaceMask", "on");
    const compositor = fakeCompositor();
    const detector = fakeDetector();
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useFaceMaskedSend({
          sourceRef,
          visionDetector: detector,
          cameraStream: camera,
          active,
          createCompositor: () => compositor,
        }),
      { initialProps: { active: false } },
    );
    expect(compositor.start).not.toHaveBeenCalled();

    rerender({ active: true });
    expect(compositor.start).toHaveBeenCalledTimes(1);

    rerender({ active: false });
    expect(compositor.pause).toHaveBeenCalledTimes(1);
  });
});

describe("useKeepMaskSourceLive", () => {
  it("가리는 동안 꺼진 원본 트랙을 다시 켠다", () => {
    const track = { enabled: false };
    const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
    renderHook(() => useKeepMaskSourceLive(stream, true));
    expect(track.enabled).toBe(true);
  });

  it("가리지 않으면 건드리지 않는다", () => {
    const track = { enabled: false };
    const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
    renderHook(() => useKeepMaskSourceLive(stream, false));
    expect(track.enabled).toBe(false);
  });

  it("가리기로 돌아오면 그사이 꺼진 원본 트랙을 다시 켠다", () => {
    const track = { enabled: true };
    const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
    const { rerender } = renderHook((masking: boolean) => useKeepMaskSourceLive(stream, masking), {
      initialProps: false,
    });
    // 원본으로 보내는 동안 일시정지해서 연결 쪽이 트랙을 껐다.
    track.enabled = false;
    rerender(true);
    expect(track.enabled).toBe(true);
  });
});
