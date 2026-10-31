import { afterEach, describe, expect, it, vi } from "vitest";

import { createFaceMaskedStream } from "../faceMaskedStream";

afterEach(() => {
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
});
