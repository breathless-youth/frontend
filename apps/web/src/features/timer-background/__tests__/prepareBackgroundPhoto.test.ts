import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnusablePhotoError } from "@/features/profile/prepareProfilePhoto";

import { prepareBackgroundPhoto } from "../prepareBackgroundPhoto";

const MB = 1024 * 1024;
const drawImage = vi.fn();

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ drawImage }) as never,
  );
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
  it("긴 변을 1920px로 줄이고 비율을 지킨 JPEG를 만든다", async () => {
    stubBitmap(3000, 4000);

    const result = await prepareBackgroundPhoto(photo());

    expect(result).toMatchObject({ width: 1440, height: 1920 });
    expect(new Uint8Array(result.bytes)).toEqual(new Uint8Array([1, 2, 3]));
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1440, 1920);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.8,
    );
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
