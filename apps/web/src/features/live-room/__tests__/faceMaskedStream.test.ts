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
});
