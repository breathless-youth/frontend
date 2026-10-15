import { afterEach, describe, expect, it, vi } from "vitest";

import type { PhotoContext, PhotoSurface, Size } from "../photoFrame";
import {
  createPhotoRenderer,
  cropRect,
  documentSurface,
  offscreenSurface,
  outputSize,
  stickerBox,
  tryRenderPhoto,
} from "../photoFrame";

describe("cropRect", () => {
  it("가로로 긴 사진을 세로 영상으로 쓰면 좌우를 잘라 가운데를 남긴다", () => {
    expect(cropRect({ width: 1280, height: 720 }, "9:16")).toEqual({
      x: 438,
      y: 0,
      width: 405,
      height: 720,
    });
  });

  it("세로로 긴 사진을 세로 영상으로 쓰면 그대로 쓴다", () => {
    expect(cropRect({ width: 720, height: 1280 }, "9:16")).toEqual({
      x: 0,
      y: 0,
      width: 720,
      height: 1280,
    });
  });

  it("가로로 긴 사진을 가로 영상으로 쓰면 그대로 쓴다", () => {
    expect(cropRect({ width: 1280, height: 720 }, "16:9")).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    });
  });

  it("세로로 긴 사진을 가로 영상으로 쓰면 위아래를 자른다", () => {
    expect(cropRect({ width: 720, height: 1280 }, "16:9")).toEqual({
      x: 0,
      y: 438,
      width: 720,
      height: 405,
    });
  });

  it("4:3 사진도 같은 규칙으로 가운데를 자른다", () => {
    expect(cropRect({ width: 640, height: 480 }, "9:16")).toEqual({
      x: 185,
      y: 0,
      width: 270,
      height: 480,
    });
    expect(cropRect({ width: 640, height: 480 }, "16:9")).toEqual({
      x: 0,
      y: 60,
      width: 640,
      height: 360,
    });
  });
});

describe("outputSize", () => {
  it("긴 변이 1280을 넘으면 비율을 지켜 줄인다", () => {
    expect(outputSize({ width: 1920, height: 1080 })).toEqual({ width: 1280, height: 720 });
  });

  it("작은 사진은 늘리지 않는다", () => {
    expect(outputSize({ width: 405, height: 720 })).toEqual({ width: 405, height: 720 });
  });
});

/**
 * 스티커 PNG는 정사각형에 내접한 원이라 상자가 아니라 원이 랜드마크 범위의 네 모서리를 덮어야 한다.
 */
function circleCoversLandmarks(
  box: { x: number; y: number; width: number },
  landmarks: readonly { x: number; y: number }[],
  frame: Size,
): boolean {
  const xs = landmarks.map((point) => point.x * frame.width);
  const ys = landmarks.map((point) => point.y * frame.height);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.width / 2;
  const radius = box.width / 2;
  const corners = [
    [Math.min(...xs), Math.min(...ys)],
    [Math.min(...xs), Math.max(...ys)],
    [Math.max(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
  return corners.every(([x, y]) => Math.hypot(x - centerX, y - centerY) <= radius);
}

describe("stickerBox", () => {
  const FRAME = { width: 1000, height: 1000 };

  it("랜드마크가 덮는 범위보다 넉넉한 정사각형을 얼굴 가운데에 둔다", () => {
    const landmarks = [
      { x: 0.4, y: 0.3 },
      { x: 0.6, y: 0.6 },
    ];
    const box = stickerBox(landmarks, FRAME);
    expect(box).toEqual({ x: 275, y: 225, width: 450, height: 450 });
    expect(circleCoversLandmarks(box!, landmarks, FRAME)).toBe(true);
  });

  it("프레임 밖으로 나가도 얼굴 가운데에 두어 원이 랜드마크 모서리를 계속 덮는다", () => {
    const landmarks = [
      { x: 0, y: 0.4 },
      { x: 0.1, y: 0.6 },
    ];
    const box = stickerBox(landmarks, FRAME);
    expect(box).toEqual({ x: -100, y: 350, width: 300, height: 300 });
    expect(circleCoversLandmarks(box!, landmarks, FRAME)).toBe(true);
  });

  it("프레임 구석의 얼굴도 원이 네 모서리를 덮는다", () => {
    const landmarks = [
      { x: 0.9, y: 0 },
      { x: 1, y: 0.15 },
    ];
    expect(circleCoversLandmarks(stickerBox(landmarks, FRAME)!, landmarks, FRAME)).toBe(true);
  });

  it("프레임보다 크면 프레임 가운데에 두어 그 축을 다 덮는다", () => {
    const landmarks = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(stickerBox(landmarks, { width: 640, height: 480 })).toEqual({
      x: -160,
      y: -240,
      width: 960,
      height: 960,
    });
  });

  it("랜드마크가 없으면 상자도 없다", () => {
    expect(stickerBox([], { width: 640, height: 480 })).toBeNull();
  });
});

function fakeSurfaces() {
  const draws: unknown[][] = [];
  const sizes: Size[] = [];
  const encoded = new Uint8Array([0xff, 0xd8]).buffer;
  const encode = vi.fn(async () => encoded);
  const newSurface = (size: Size): PhotoSurface => {
    sizes.push(size);
    const context = {
      drawImage: (...args: unknown[]) => {
        draws.push(args);
      },
    } as unknown as PhotoContext;
    return { context, encode };
  };
  return { draws, sizes, encoded, encode, newSurface };
}

const source = { tag: "frame" } as unknown as CanvasImageSource;
const sticker = { tag: "sticker" } as unknown as CanvasImageSource;
const FACE = [
  { x: 0.4, y: 0.3 },
  { x: 0.6, y: 0.6 },
];

describe("createPhotoRenderer", () => {
  it("가림이 꺼져 있으면 자른 프레임만 그리고 스티커를 받지 않는다", async () => {
    const surfaces = fakeSurfaces();
    const loadSticker = vi.fn(async () => sticker);
    const render = createPhotoRenderer(surfaces.newSurface, loadSticker);

    const bytes = await render({
      source,
      frame: { width: 1280, height: 720 },
      spec: { aspect: "9:16", mask: false },
      landmarks: FACE,
    });

    expect(bytes).toBe(surfaces.encoded);
    expect(surfaces.sizes).toEqual([{ width: 405, height: 720 }]);
    expect(surfaces.draws).toEqual([[source, 438, 0, 405, 720, 0, 0, 405, 720]]);
    expect(loadSticker).not.toHaveBeenCalled();
  });

  it("가림이 켜져 있으면 같은 프레임의 얼굴 자리에 스티커를 덮는다", async () => {
    const surfaces = fakeSurfaces();
    const render = createPhotoRenderer(surfaces.newSurface, async () => sticker);

    await render({
      source,
      frame: { width: 1000, height: 1000 },
      spec: { aspect: "16:9", mask: true },
      landmarks: FACE,
    });

    // 자르기는 y 219부터 563줄이다.
    // 그래서 스티커 상자 y 225는 출력에서 6이 된다.
    expect(surfaces.draws).toEqual([
      [source, 0, 219, 1000, 563, 0, 0, 1000, 563],
      [sticker, 275, 6, 450, 450],
    ]);
  });

  it("얼굴이 없는 프레임은 가림이 켜져 있어도 그대로 남긴다", async () => {
    const surfaces = fakeSurfaces();
    const loadSticker = vi.fn(async () => sticker);
    const render = createPhotoRenderer(surfaces.newSurface, loadSticker);

    await render({
      source,
      frame: { width: 1280, height: 720 },
      spec: { aspect: "9:16", mask: true },
    });

    expect(surfaces.draws).toHaveLength(1);
    expect(loadSticker).not.toHaveBeenCalled();
  });

  it("스티커는 한 번만 받는다", async () => {
    const surfaces = fakeSurfaces();
    const loadSticker = vi.fn(async () => sticker);
    const render = createPhotoRenderer(surfaces.newSurface, loadSticker);
    const input = {
      source,
      frame: { width: 1000, height: 1000 },
      spec: { aspect: "9:16" as const, mask: true },
      landmarks: FACE,
    };

    await render(input);
    await render(input);

    expect(loadSticker).toHaveBeenCalledTimes(1);
  });

  it("스티커를 받지 못하면 가리지 못한 사진을 만들지 않고 실패하며 다음에 다시 받는다", async () => {
    const surfaces = fakeSurfaces();
    const loadSticker = vi
      .fn<() => Promise<CanvasImageSource>>()
      .mockRejectedValueOnce(new Error("404"))
      .mockResolvedValue(sticker);
    const render = createPhotoRenderer(surfaces.newSurface, loadSticker);
    const input = {
      source,
      frame: { width: 1000, height: 1000 },
      spec: { aspect: "9:16" as const, mask: true },
      landmarks: FACE,
    };

    await expect(render(input)).rejects.toThrow("404");
    expect(surfaces.encode).not.toHaveBeenCalled();
    await expect(render(input)).resolves.toBe(surfaces.encoded);
    expect(loadSticker).toHaveBeenCalledTimes(2);
  });
});

describe("createPhotoRenderer 그리는 순간", () => {
  it("스티커를 기다리기 전에 프레임을 먼저 그린다", () => {
    const surfaces = fakeSurfaces();
    const render = createPhotoRenderer(surfaces.newSurface, () => new Promise(() => {}));

    void render({
      source,
      frame: { width: 1000, height: 1000 },
      spec: { aspect: "9:16", mask: true },
      landmarks: FACE,
    });

    // 메인 스레드 경로는 이 동기 구간이 추론과 같은 순간이라 await 없이 확인한다.
    expect(surfaces.draws).toHaveLength(1);
    expect(surfaces.draws[0]?.[0]).toBe(source);
  });
});

describe("캔버스 압축 설정", () => {
  const ENCODED = new Uint8Array([0xff, 0xd8]).buffer;
  const context = { drawImage: vi.fn() };
  /** jsdom의 Blob은 arrayBuffer가 없어 바이트만 돌려주는 대역을 쓴다. */
  const blob = { arrayBuffer: async () => ENCODED } as unknown as Blob;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("워커 캔버스는 JPEG 품질 0.8로 압축한다", async () => {
    const convertToBlob = vi.fn(async (_options?: ImageEncodeOptions) => blob);
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return context;
        }
        convertToBlob = convertToBlob;
      },
    );

    await expect(offscreenSurface({ width: 405, height: 720 }).encode()).resolves.toBe(ENCODED);

    expect(convertToBlob).toHaveBeenCalledWith({ type: "image/jpeg", quality: 0.8 });
  });

  it("메인 스레드 캔버스도 JPEG 품질 0.8로 압축한다", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context as never);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => callback(blob));

    await expect(documentSurface({ width: 405, height: 720 }).encode()).resolves.toBe(ENCODED);

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.8);
  });
});

describe("tryRenderPhoto", () => {
  it("사진을 만들지 못하면 던지지 않고 undefined를 돌려준다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const render = vi.fn(async () => {
      throw new Error("convertToBlob 실패");
    });

    await expect(
      tryRenderPhoto(render, {
        source,
        frame: { width: 1, height: 1 },
        spec: { aspect: "9:16", mask: false },
      }),
    ).resolves.toBeUndefined();
  });
});
