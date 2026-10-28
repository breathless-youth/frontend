import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prepareProfilePhoto, UnusablePhotoError } from "../prepareProfilePhoto";

const MB = 1024 * 1024;
const drawImage = vi.fn();
const close = vi.fn();

/** 품질별로 toBlob이 차례로 돌려줄 JPEG 크기. null이면 압축에 실패한 것이다. */
let encodedSizes: Array<number | null>;

const BYTES = "raw-bytes";

function photo(size = 3 * MB): File {
  const file = new File([BYTES], "photo.heic", { type: "image/heic" });
  Object.defineProperty(file, "size", { value: size });
  // jsdom의 File에는 arrayBuffer가 없어 직접 단다.
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn(async () => new TextEncoder().encode(BYTES).buffer),
  });
  return file;
}

function readText(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(blob);
  });
}

function stubBitmap(width: number, height: number) {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width, height, close }) as unknown as ImageBitmap),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  encodedSizes = [200_000];
  stubBitmap(4000, 3000);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ drawImage }) as never,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    const size = encodedSizes.shift() ?? null;
    callback(size === null ? null : new Blob([new Uint8Array(size)], { type: "image/jpeg" }));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prepareProfilePhoto", () => {
  it("가로 사진은 가운데 정사각형을 512px JPEG 품질 0.85로 만든다", async () => {
    const result = await prepareProfilePhoto(photo());

    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    const source = vi.mocked(createImageBitmap).mock.calls[0][0] as Blob;
    expect(createImageBitmap).toHaveBeenCalledWith(source, { imageOrientation: "from-image" });
    expect(source).not.toBeInstanceOf(File);
    expect(source.type).toBe("image/heic");
    expect(await readText(source)).toBe(BYTES);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 500, 0, 3000, 3000, 0, 0, 512, 512);
    const toBlob = vi.mocked(HTMLCanvasElement.prototype.toBlob);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.85);
    expect((toBlob.mock.contexts[0] as HTMLCanvasElement).width).toBe(512);
    expect((toBlob.mock.contexts[0] as HTMLCanvasElement).height).toBe(512);
    expect(result.size).toBe(200_000);
    expect(close).toHaveBeenCalled();
  });

  it("세로 사진은 위아래를 같은 만큼 잘라 낸다", async () => {
    stubBitmap(3000, 4000);

    await prepareProfilePhoto(photo());

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 500, 3000, 3000, 0, 0, 512, 512);
  });

  it("0.85로 1MB를 넘으면 0.7로 한 번 더 만들고, 딱 1MB면 그대로 쓴다", async () => {
    encodedSizes = [MB + 1, MB];

    const result = await prepareProfilePhoto(photo());

    const toBlob = vi.mocked(HTMLCanvasElement.prototype.toBlob);
    expect(toBlob).toHaveBeenNthCalledWith(2, expect.any(Function), "image/jpeg", 0.7);
    expect(result.size).toBe(MB);
  });

  it("0.7로도 1MB를 넘으면 쓸 수 없는 사진이다", async () => {
    encodedSizes = [MB + 1, MB + 1];

    await expect(prepareProfilePhoto(photo())).rejects.toBeInstanceOf(UnusablePhotoError);
  });

  it("원본이 20MB를 넘으면 읽지 않고 쓸 수 없는 사진이다", async () => {
    const file = photo(20 * MB + 1);

    await expect(prepareProfilePhoto(file)).rejects.toBeInstanceOf(UnusablePhotoError);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("파일을 읽지 못하면 디코드하지 않고 쓸 수 없는 사진이다", async () => {
    const file = photo();
    vi.mocked(file.arrayBuffer).mockRejectedValueOnce(
      new DOMException("선택이 풀린 파일", "NotReadableError"),
    );

    await expect(prepareProfilePhoto(file)).rejects.toBeInstanceOf(UnusablePhotoError);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("읽을 수 없는 형식이면 다시 읽지 않고 쓸 수 없는 사진이다", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new DOMException("디코드 실패", "InvalidStateError");
      }),
    );

    await expect(prepareProfilePhoto(photo())).rejects.toBeInstanceOf(UnusablePhotoError);
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
  });

  it("방향 옵션 없이 다시 읽어도 실패하면 쓸 수 없는 사진이다", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError("imageOrientation"))
        .mockRejectedValueOnce(new DOMException("디코드 실패", "InvalidStateError")),
    );

    await expect(prepareProfilePhoto(photo())).rejects.toBeInstanceOf(UnusablePhotoError);
    expect(createImageBitmap).toHaveBeenCalledTimes(2);
  });

  it("방향 옵션을 모르는 엔진이 거절하면 옵션 없이 한 번 더 읽는다", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError("imageOrientation"))
        .mockResolvedValueOnce({ width: 4000, height: 3000, close } as unknown as ImageBitmap),
    );

    const result = await prepareProfilePhoto(photo());

    expect(createImageBitmap).toHaveBeenCalledTimes(2);
    const [first, second] = vi.mocked(createImageBitmap).mock.calls;
    expect(second).toHaveLength(1);
    expect(second[0]).toBe(first[0]);
    expect(second[0]).not.toBeInstanceOf(File);
    expect(result.size).toBe(200_000);
  });

  it("그리다 실패하면 쓸 수 없는 사진이다", async () => {
    drawImage.mockImplementationOnce(() => {
      throw new DOMException("캔버스 한도 초과", "InvalidStateError");
    });

    await expect(prepareProfilePhoto(photo())).rejects.toBeInstanceOf(UnusablePhotoError);
    expect(close).toHaveBeenCalled();
  });

  it("압축 중에 오류가 나면 쓸 수 없는 사진이다", async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(() => {
      throw new DOMException("내보낼 수 없는 캔버스", "SecurityError");
    });

    await expect(prepareProfilePhoto(photo())).rejects.toBeInstanceOf(UnusablePhotoError);
  });

  it("압축에 실패하면 쓸 수 없는 사진이다", async () => {
    encodedSizes = [null, null];

    await expect(prepareProfilePhoto(photo())).rejects.toBeInstanceOf(UnusablePhotoError);
  });

  it("JPEG를 만들지 못하고 다른 형식이 나오면 쓸 수 없는 사진이다", async () => {
    // 캔버스는 요청한 형식을 못 만들면 오류 없이 PNG를 준다.
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => {
      callback(new Blob([new Uint8Array(200_000)], { type: "image/png" }));
    });

    await expect(prepareProfilePhoto(photo())).rejects.toBeInstanceOf(UnusablePhotoError);
  });
});
