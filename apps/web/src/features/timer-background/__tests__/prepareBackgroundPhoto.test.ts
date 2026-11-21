import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnusablePhotoError } from "@/features/profile/prepareProfilePhoto";

import { prepareBackgroundPhoto } from "../prepareBackgroundPhoto";

const MB = 1024 * 1024;
const drawImage = vi.fn();
const context = { drawImage, imageSmoothingEnabled: false, imageSmoothingQuality: "low" };

function photo(size = 3 * MB): File {
  const file = new File(["raw"], "photo.jpg", { type: "image/jpeg" });
  Object.defineProperty(file, "size", { value: size });
  // jsdom의 File에는 arrayBuffer가 없어 직접 단다.
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn(async () => new TextEncoder().encode("raw").buffer),
  });
  return file;
}

function stubBitmap(width: number, height: number) {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width, height, close: vi.fn() }) as unknown as ImageBitmap),
  );
}

function stubScreen(width: number, height: number, ratio: number) {
  vi.stubGlobal("screen", { width, height });
  vi.stubGlobal("devicePixelRatio", ratio);
}

beforeEach(() => {
  vi.clearAllMocks();
  context.imageSmoothingEnabled = false;
  context.imageSmoothingQuality = "low";
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    // jsdom의 Blob에는 arrayBuffer가 없어 직접 단다.
    Object.defineProperty(blob, "arrayBuffer", {
      value: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    callback(blob);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prepareBackgroundPhoto", () => {
  it("해상도가 낮은 화면이어도 긴 변을 1920px까지 남기고 비율을 지킨 JPEG를 만든다", async () => {
    stubScreen(1280, 800, 1);
    stubBitmap(3000, 4000);

    const result = await prepareBackgroundPhoto(photo());

    expect(result).toMatchObject({ width: 1440, height: 1920 });
    expect(new Uint8Array(result.bytes)).toEqual(new Uint8Array([1, 2, 3]));
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1440, 1920);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.9,
    );
  });

  it("휴대폰 화면이면 화면 긴 변의 실제 픽셀만큼 남긴다", async () => {
    stubScreen(393, 852, 3);
    stubBitmap(3000, 4000);

    expect(await prepareBackgroundPhoto(photo())).toMatchObject({ width: 1917, height: 2556 });
  });

  it("PC 화면이면 화면을 실제 픽셀로 덮을 만큼 긴 변을 남긴다", async () => {
    stubScreen(1512, 982, 2);
    stubBitmap(4000, 3000);

    expect(await prepareBackgroundPhoto(photo())).toMatchObject({ width: 3024, height: 2268 });
  });

  it("아주 큰 화면이어도 긴 변은 3840px을 넘기지 않는다", async () => {
    stubScreen(2560, 1440, 2);
    stubBitmap(8000, 6000);

    expect(await prepareBackgroundPhoto(photo())).toMatchObject({ width: 3840, height: 2880 });
  });

  it("줄일 때 높은 품질의 보간을 쓴다", async () => {
    stubBitmap(4000, 3000);

    await prepareBackgroundPhoto(photo());

    expect(context).toMatchObject({ imageSmoothingEnabled: true, imageSmoothingQuality: "high" });
  });

  it("이미 작은 사진은 키우지 않는다", async () => {
    stubBitmap(800, 600);

    expect(await prepareBackgroundPhoto(photo())).toMatchObject({ width: 800, height: 600 });
  });

  it("너무 큰 원본과 읽지 못한 사진은 쓸 수 없는 사진으로 거절한다", async () => {
    stubBitmap(3000, 4000);
    await expect(prepareBackgroundPhoto(photo(30 * MB))).rejects.toBeInstanceOf(UnusablePhotoError);

    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new DOMException("bad");
      }),
    );
    await expect(prepareBackgroundPhoto(photo())).rejects.toBeInstanceOf(UnusablePhotoError);
  });
});
