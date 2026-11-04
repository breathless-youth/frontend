import { afterEach, describe, expect, it, vi } from "vitest";

import type { PhotoContext, PhotoSurface, Size } from "../photoFrame";
import {
  createPhotoRenderer,
  cropRect,
  documentSurface,
  ESTIMATE_SCALE,
  maskBox,
  offscreenSurface,
  outputSize,
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

const FACE = [
  { x: 0.4, y: 0.3 },
  { x: 0.6, y: 0.6 },
];
const DOG = "/face-mask/dog.png";
const CAT = "/face-mask/cat.png";
/** 사람 검출과 직전 얼굴로 어림한 자리. 타임랩스는 `visible`이 거짓이어도 덮는다. */
const SPOT = { x: 0.5, y: 0.4, size: 0.2, aspect: 1, visible: false };

describe("maskBox", () => {
  const FRAME = { width: 1000, height: 1000 };

  it("랜드마크가 있으면 소셜룸과 같은 배율의 정사각형을 얼굴 가운데에 둔다", () => {
    expect(maskBox(FRAME, FACE, undefined)).toEqual({ x: 238, y: 187, width: 525, height: 525 });
  });

  it("랜드마크가 있으면 어림 자리보다 랜드마크 자리가 이긴다", () => {
    expect(maskBox(FRAME, FACE, SPOT)).toEqual(maskBox(FRAME, FACE, undefined));
  });

  it("얼굴을 놓쳤으면 어림 자리를 더 크게 덮는다", () => {
    const side = Math.round(0.2 * ESTIMATE_SCALE * 1000);
    expect(ESTIMATE_SCALE).toBeGreaterThan(1);
    expect(maskBox(FRAME, [], SPOT)).toEqual({
      x: Math.round(500 - side / 2),
      y: Math.round(400 - side / 2),
      width: side,
      height: side,
    });
  });

  it("세로 범위는 프레임 폭 기준으로 바꿔 긴 쪽을 고른다", () => {
    const tall = [
      { x: 0.45, y: 0.2 },
      { x: 0.55, y: 0.8 },
    ];
    // 세로 0.6 × 480 = 288px가 가로 64px보다 길어 288 × 1.75 = 504가 된다.
    expect(maskBox({ width: 640, height: 480 }, tall, undefined)?.width).toBe(504);
  });

  it("프레임 밖으로 나가도 얼굴 가운데에 둔다", () => {
    const edge = [
      { x: 0, y: 0.4 },
      { x: 0.1, y: 0.6 },
    ];
    expect(maskBox(FRAME, edge, undefined)).toEqual({ x: -125, y: 325, width: 350, height: 350 });
  });

  it("랜드마크도 어림 자리도 없으면 상자가 없다", () => {
    expect(maskBox(FRAME, undefined, undefined)).toBeNull();
    expect(maskBox(FRAME, [], undefined)).toBeNull();
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
const emoji = { tag: "emoji" } as unknown as CanvasImageSource;

describe("createPhotoRenderer", () => {
  it("가림이 꺼져 있으면 자른 프레임만 그리고 이모지를 받지 않는다", async () => {
    const surfaces = fakeSurfaces();
    const loadImage = vi.fn(async (_url: string) => emoji);
    const render = createPhotoRenderer(surfaces.newSurface, loadImage);

    const bytes = await render({
      source,
      frame: { width: 1280, height: 720 },
      spec: { aspect: "9:16", mask: false, emojiUrl: DOG, spot: SPOT },
      landmarks: FACE,
    });

    expect(bytes).toBe(surfaces.encoded);
    expect(surfaces.sizes).toEqual([{ width: 405, height: 720 }]);
    expect(surfaces.draws).toEqual([[source, 438, 0, 405, 720, 0, 0, 405, 720]]);
    expect(loadImage).not.toHaveBeenCalled();
  });

  it("가림이 켜져 있으면 같은 프레임의 얼굴 자리에 고른 이모지를 덮는다", async () => {
    const surfaces = fakeSurfaces();
    const loadImage = vi.fn(async (_url: string) => emoji);
    const render = createPhotoRenderer(surfaces.newSurface, loadImage);

    await render({
      source,
      frame: { width: 1000, height: 1000 },
      spec: { aspect: "16:9", mask: true, emojiUrl: CAT },
      landmarks: FACE,
    });

    // 자르기는 y 219부터 563줄이라 상자 y 187은 출력에서 -32가 된다.
    expect(surfaces.draws).toEqual([
      [source, 0, 219, 1000, 563, 0, 0, 1000, 563],
      [emoji, 238, -32, 525, 525],
    ]);
    expect(loadImage).toHaveBeenCalledWith(CAT);
  });

  it("얼굴을 놓친 프레임은 실려 온 어림 자리에 이모지를 덮는다", async () => {
    const surfaces = fakeSurfaces();
    const render = createPhotoRenderer(surfaces.newSurface, async () => emoji);

    await render({
      source,
      frame: { width: 1000, height: 1000 },
      spec: { aspect: "16:9", mask: true, emojiUrl: DOG, spot: SPOT },
    });

    const box = maskBox({ width: 1000, height: 1000 }, undefined, SPOT)!;
    expect(surfaces.draws).toEqual([
      [source, 0, 219, 1000, 563, 0, 0, 1000, 563],
      [emoji, box.x, box.y - 219, box.width, box.height],
    ]);
  });

  it("얼굴도 어림 자리도 없으면 사람이 없는 장면이라 그대로 남긴다", async () => {
    const surfaces = fakeSurfaces();
    const loadImage = vi.fn(async (_url: string) => emoji);
    const render = createPhotoRenderer(surfaces.newSurface, loadImage);

    await render({
      source,
      frame: { width: 1280, height: 720 },
      spec: { aspect: "9:16", mask: true, emojiUrl: DOG },
    });

    expect(surfaces.draws).toHaveLength(1);
    expect(loadImage).not.toHaveBeenCalled();
  });

  it("같은 주소의 이모지는 한 번만 받고 주소가 다르면 따로 받는다", async () => {
    const surfaces = fakeSurfaces();
    const loadImage = vi.fn(async (_url: string) => emoji);
    const render = createPhotoRenderer(surfaces.newSurface, loadImage);
    const input = {
      source,
      frame: { width: 1000, height: 1000 },
      spec: { aspect: "9:16" as const, mask: true, emojiUrl: DOG },
      landmarks: FACE,
    };

    await render(input);
    await render(input);
    await render({ ...input, spec: { ...input.spec, emojiUrl: CAT } });

    expect(loadImage.mock.calls).toEqual([[DOG], [CAT]]);
  });

  it("이모지를 받지 못하면 가리지 못한 사진을 만들지 않고 실패하며 다음에 다시 받는다", async () => {
    const surfaces = fakeSurfaces();
    const loadImage = vi
      .fn<(url: string) => Promise<CanvasImageSource>>()
      .mockRejectedValueOnce(new Error("404"))
      .mockResolvedValue(emoji);
    const render = createPhotoRenderer(surfaces.newSurface, loadImage);
    const input = {
      source,
      frame: { width: 1000, height: 1000 },
      spec: { aspect: "9:16" as const, mask: true, emojiUrl: DOG },
      landmarks: FACE,
    };

    await expect(render(input)).rejects.toThrow("404");
    expect(surfaces.encode).not.toHaveBeenCalled();
    await expect(render(input)).resolves.toBe(surfaces.encoded);
    expect(loadImage).toHaveBeenCalledTimes(2);
  });
});

describe("createPhotoRenderer 그리는 순간", () => {
  it("이모지를 기다리기 전에 프레임을 먼저 그린다", () => {
    const surfaces = fakeSurfaces();
    const render = createPhotoRenderer(surfaces.newSurface, () => new Promise(() => {}));

    void render({
      source,
      frame: { width: 1000, height: 1000 },
      spec: { aspect: "9:16", mask: true, emojiUrl: DOG },
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

  it("워커 캔버스는 JPEG 품질 0.5로 압축한다", async () => {
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

    expect(convertToBlob).toHaveBeenCalledWith({ type: "image/jpeg", quality: 0.5 });
  });

  it("메인 스레드 캔버스도 JPEG 품질 0.5로 압축한다", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context as never);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => callback(blob));

    await expect(documentSurface({ width: 405, height: 720 }).encode()).resolves.toBe(ENCODED);

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.5);
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
        spec: { aspect: "9:16", mask: false, emojiUrl: DOG },
      }),
    ).resolves.toBeUndefined();
  });
});
