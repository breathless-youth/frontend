import { afterEach, describe, expect, it, vi } from "vitest";

import { createFaceMaskedStream } from "../faceMaskedStream";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>).captureStream;
});

describe("createFaceMaskedStream", () => {
  it("캔버스 영상 송신이 없으면 미지원이다", () => {
    expect(createFaceMaskedStream(() => null)).toBeNull();
  });

  it("그리기 준비 중에 예외가 나면 미지원으로 다룬다", () => {
    HTMLCanvasElement.prototype.captureStream = () => ({}) as MediaStream;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      throw new Error("context blocked");
    });
    expect(createFaceMaskedStream(() => null)).toBeNull();
  });

  it("준비 도중 GPU 연결이 끊기면 미지원으로 다룬다", () => {
    HTMLCanvasElement.prototype.captureStream = () =>
      ({ getVideoTracks: () => [{}] }) as unknown as MediaStream;
    const lostContext = new Proxy(
      {
        isContextLost: () => true,
        getShaderParameter: () => true,
        getProgramParameter: () => true,
      },
      { get: (target, key) => (key in target ? target[key as keyof typeof target] : () => ({})) },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      lostContext as unknown as WebGLRenderingContext,
    );
    expect(createFaceMaskedStream(() => null)).toBeNull();
  });

  it("해제하면 그리기를 멈추고 송신 트랙과 GPU 연결을 놓는다", () => {
    vi.useFakeTimers();
    const track = { stop: vi.fn() };
    HTMLCanvasElement.prototype.captureStream = () =>
      ({ getVideoTracks: () => [track], getTracks: () => [track] }) as unknown as MediaStream;
    const loseContext = vi.fn();
    const createProgram = vi.fn(() => ({}));
    const context = new Proxy(
      {
        createProgram,
        isContextLost: () => false,
        getShaderParameter: () => true,
        getProgramParameter: () => true,
        getExtension: (name: string) => (name === "WEBGL_lose_context" ? { loseContext } : null),
      },
      { get: (target, key) => (key in target ? target[key as keyof typeof target] : () => ({})) },
    );
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context as unknown as WebGLRenderingContext);
    const video = vi.fn(() => null);
    const compositor = createFaceMaskedStream(video);
    expect(compositor).not.toBeNull();

    compositor!.start();
    vi.advanceTimersByTime(200);
    const drawn = video.mock.calls.length;
    expect(drawn).toBeGreaterThan(0);

    compositor!.dispose();
    vi.advanceTimersByTime(1000);
    expect(video).toHaveBeenCalledTimes(drawn);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(loseContext).toHaveBeenCalledTimes(1);

    // 해제한 뒤 복구 이벤트가 와도 버린 합성기의 GPU 자원을 다시 만들지 않는다.
    const programs = createProgram.mock.calls.length;
    const canvas = getContext.mock.contexts[0] as HTMLCanvasElement;
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(createProgram).toHaveBeenCalledTimes(programs);
    expect(() => compositor!.dispose()).not.toThrow();
  });
});
