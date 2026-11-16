import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetItemBoundsForTests,
  cutoutFrame,
  measureImageBounds,
  unionBounds,
  useItemBounds,
  type ItemBounds,
} from "../itemBounds";

// 측정 판의 한 변이며 itemBounds.ts의 값과 같다.
const SAMPLE = 160;

/** 합치거나 나눈 비율은 소수 끝자리가 달라져 자리마다 가까운 값으로 비교한다. */
function near(bounds: ItemBounds) {
  return {
    x: expect.closeTo(bounds.x) as number,
    y: expect.closeTo(bounds.y) as number,
    width: expect.closeTo(bounds.width) as number,
    height: expect.closeTo(bounds.height) as number,
  };
}

/** 칸 안에서 소품이 놓이는 자리를 칸 한 변에 대한 비율로 되돌린다. */
function itemBoxInCell(bounds: ItemBounds, frame: ReturnType<typeof cutoutFrame>) {
  const num = (value: unknown) => Number.parseFloat(String(value)) / 100;
  const left = num(frame.left);
  const top = num(frame.top);
  const width = num(frame.width);
  const height = num(frame.height);
  return {
    left: left + bounds.x * width,
    right: left + (bounds.x + bounds.width) * width,
    top: top + bounds.y * height,
    bottom: top + (bounds.y + bounds.height) * height,
  };
}

/** 알파가 255인 사각형 하나와 그 밖의 거의 투명한 점을 담은 측정 판 */
function alphaData(rect: { x: number; y: number; width: number; height: number } | null) {
  const data = new Uint8ClampedArray(SAMPLE * SAMPLE * 4);
  // 가장자리의 옅은 그림자처럼 거의 투명한 점은 소품으로 치지 않는다.
  data[3] = 10;
  if (rect !== null) {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        data[(y * SAMPLE + x) * 4 + 3] = 255;
      }
    }
  }
  return data;
}

function stubCanvas(data: Uint8ClampedArray | null) {
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: () => Promise.resolve(),
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    data === null
      ? null
      : ({
          drawImage: () => {},
          getImageData: () => ({ data }),
        } as unknown as CanvasRenderingContext2D),
  );
}

// 측정값을 남기는 저장소 키이며 itemBounds.ts의 값과 같다.
const STORAGE_KEY = "points.itemBounds.v1";

/** 저장소는 그대로 두고 앱을 다시 켠 것처럼 메모리의 측정값만 비운다. */
const relaunch = __resetItemBoundsForTests;

/** 저장소에 남은 그림 주소를 남긴 순서대로 */
function storedUrls(): string[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === null ? [] : (JSON.parse(raw) as [string][]).map(([url]) => url);
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
  localStorage.removeItem(STORAGE_KEY);
  relaunch();
});

describe("measureImageBounds", () => {
  it("투명하지 않은 점이 있는 자리를 판 한 변에 대한 비율로 돌려준다", async () => {
    stubCanvas(alphaData({ x: 40, y: 16, width: 40, height: 16 }));

    await expect(measureImageBounds("/bounds/hat.png")).resolves.toEqual({
      x: 0.25,
      y: 0.1,
      width: 0.25,
      height: 0.1,
    });
  });

  it("다 투명한 그림은 자리를 모른다", async () => {
    stubCanvas(alphaData(null));

    await expect(measureImageBounds("/bounds/empty.png")).resolves.toBeNull();
  });

  it("캔버스를 쓸 수 없으면 자리를 모른다", async () => {
    stubCanvas(null);

    await expect(measureImageBounds("/bounds/no-canvas.png")).resolves.toBeNull();
  });

  it("그림을 읽지 못하면 throw하지 않고 자리를 모른다", async () => {
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value: () => Promise.reject(new Error("broken image")),
    });

    await expect(measureImageBounds("/bounds/broken.png")).resolves.toBeNull();
  });

  it("decode가 없는 환경에서도 throw하지 않고 자리를 모른다", async () => {
    await expect(measureImageBounds("/bounds/no-decode.png")).resolves.toBeNull();
  });

  it("같은 그림은 한 번만 읽는다", async () => {
    stubCanvas(alphaData({ x: 0, y: 0, width: 16, height: 16 }));
    const decode = vi.spyOn(HTMLImageElement.prototype, "decode");

    const [first, second] = await Promise.all([
      measureImageBounds("/bounds/once.png"),
      measureImageBounds("/bounds/once.png"),
    ]);
    await measureImageBounds("/bounds/once.png");

    expect(first).toEqual(second);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  describe("읽는 주소", () => {
    /** 측정하려고 받은 그림 주소를 모은다. */
    function recordReads() {
      const reads: string[] = [];
      Object.defineProperty(HTMLImageElement.prototype, "decode", {
        configurable: true,
        value(this: HTMLImageElement) {
          reads.push(this.src);
          return Promise.resolve();
        },
      });
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
      return reads;
    }

    it("다른 출처의 소품 그림은 웹과 같은 출처의 같은 경로로 읽는다", async () => {
      const reads = recordReads();

      await measureImageBounds("https://web-dev.focusmakers.app/avatars/shop/hat.png?v=2");

      expect(reads).toEqual([`${window.location.origin}/avatars/shop/hat.png?v=2`]);
    });

    it("같은 출처 그림과 소품 경로가 아닌 다른 출처 그림은 받은 주소 그대로 읽는다", async () => {
      const reads = recordReads();

      await measureImageBounds("/avatars/shop/same.png");
      await measureImageBounds("https://cdn.example.com/images/hat.png");

      expect(reads).toEqual([
        `${window.location.origin}/avatars/shop/same.png`,
        "https://cdn.example.com/images/hat.png",
      ]);
    });
  });
});

describe("측정값 기억하기", () => {
  it("측정한 자리는 앱을 다시 켜도 그림을 다시 읽지 않고 첫 그리기부터 쓴다", async () => {
    stubCanvas(alphaData({ x: 40, y: 16, width: 40, height: 16 }));
    await measureImageBounds("/bounds/keep.png");
    relaunch();
    const decode = vi.spyOn(HTMLImageElement.prototype, "decode");

    const { result } = renderHook(() => useItemBounds(["/bounds/keep.png"]));

    expect(result.current).toEqual({ x: 0.25, y: 0.1, width: 0.25, height: 0.1 });
    await expect(measureImageBounds("/bounds/keep.png")).resolves.toEqual(result.current);
    expect(decode).not.toHaveBeenCalled();
  });

  it("측정하지 못한 그림은 남기지 않아 다음에 켜면 다시 잰다", async () => {
    stubCanvas(null);
    await expect(measureImageBounds("/bounds/retry.png")).resolves.toBeNull();
    expect(storedUrls()).toEqual([]);
    relaunch();
    vi.restoreAllMocks();
    stubCanvas(alphaData({ x: 0, y: 0, width: 16, height: 16 }));

    await expect(measureImageBounds("/bounds/retry.png")).resolves.toEqual({
      x: 0,
      y: 0,
      width: 0.1,
      height: 0.1,
    });
  });

  it("저장소를 읽거나 쓰지 못해도 지금처럼 잰다", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    stubCanvas(alphaData({ x: 0, y: 0, width: 16, height: 16 }));

    await expect(measureImageBounds("/bounds/no-storage.png")).resolves.toEqual({
      x: 0,
      y: 0,
      width: 0.1,
      height: 0.1,
    });
  });

  it.each([
    ["JSON이 아닌 값", "{broken"],
    ["목록이 아닌 값", JSON.stringify({ "/bounds/bad.png": [0, 0, 1, 1] })],
    ["판 밖의 자리", JSON.stringify([["/bounds/bad.png", 0.5, 0, 0.8, 0.2]])],
    ["크기가 0인 자리", JSON.stringify([["/bounds/bad.png", 0, 0, 0, 0.2]])],
  ])("%s으로 남은 측정값은 버리고 다시 잰다", async (_, raw) => {
    localStorage.setItem(STORAGE_KEY, raw);
    relaunch();
    stubCanvas(alphaData({ x: 0, y: 0, width: 16, height: 16 }));
    const decode = vi.spyOn(HTMLImageElement.prototype, "decode");

    await expect(measureImageBounds("/bounds/bad.png")).resolves.toEqual({
      x: 0,
      y: 0,
      width: 0.1,
      height: 0.1,
    });
    expect(decode).toHaveBeenCalledOnce();
  });

  it("1000개를 넘으면 오래 전에 잰 것부터 버린다", async () => {
    const old = Array.from({ length: 1000 }, (_, i) => [`/bounds/old-${i}.png`, 0, 0, 0.5, 0.5]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(old));
    relaunch();
    stubCanvas(alphaData({ x: 0, y: 0, width: 16, height: 16 }));

    await measureImageBounds("/bounds/new.png");

    const urls = storedUrls();
    expect(urls).toHaveLength(1000);
    expect(urls[0]).toBe("/bounds/old-1.png");
    expect(urls.at(-1)).toBe("/bounds/new.png");
  });
});

describe("unionBounds", () => {
  it("여러 그림의 자리를 모두 담는 하나의 자리로 합친다", () => {
    expect(
      unionBounds([
        { x: 0.2, y: 0.3, width: 0.2, height: 0.1 },
        { x: 0.3, y: 0.1, width: 0.4, height: 0.1 },
      ]),
    ).toEqual(near({ x: 0.2, y: 0.1, width: 0.5, height: 0.3 }));
  });

  it("하나라도 자리를 모르거나 그림이 없으면 자리를 모른다", () => {
    expect(unionBounds([{ x: 0, y: 0, width: 1, height: 1 }, null])).toBeNull();
    expect(unionBounds([])).toBeNull();
  });
});

describe("cutoutFrame", () => {
  it("자리를 모르면 판 전체를 칸 가운데에 맞춘다", () => {
    expect(cutoutFrame(null, 0.8)).toEqual({ top: 0, height: "100%", width: "100%", left: "0%" });
    // 가로로 넓은 칸은 판 높이를 칸 높이에 맞추고 가로 가운데에 둔다.
    expect(cutoutFrame(null, 0.8, 6 / 5)).toEqual({
      top: 0,
      height: "100%",
      width: "83.333%",
      left: "8.333%",
    });
    // 세로로 긴 칸은 판 폭을 칸 폭에 맞추고 세로 가운데에 둔다.
    expect(cutoutFrame(null, 0.8, 0.5)).toEqual({
      left: 0,
      width: "100%",
      height: "50%",
      top: "25%",
    });
  });

  it("가로로 넓은 소품은 칸 가로의 fill만큼 차고 칸 가운데에 온다", () => {
    const bounds = { x: 0.4, y: 0.3, width: 0.2, height: 0.1 };
    const box = itemBoxInCell(bounds, cutoutFrame(bounds, 0.8));

    expect(box.left).toBeCloseTo(0.1);
    expect(box.right).toBeCloseTo(0.9);
    expect((box.top + box.bottom) / 2).toBeCloseTo(0.5);
  });

  it("납작한 칸에서 세로로 긴 소품은 칸 높이의 fill만큼 차고 칸 밖으로 나가지 않는다", () => {
    const bounds = { x: 0.45, y: 0.2, width: 0.1, height: 0.6 };
    const box = itemBoxInCell(bounds, cutoutFrame(bounds, 0.8, 6 / 5));

    expect(box.bottom - box.top).toBeCloseTo(0.8);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(1);
    expect((box.left + box.right) / 2).toBeCloseTo(0.5);
  });
});

describe("useItemBounds", () => {
  it("측정하는 동안은 값이 없고 측정하지 못하면 자리를 모른다", async () => {
    const { result } = renderHook(() => useItemBounds(["/bounds/hook-broken.png"]));

    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("이미 측정한 그림은 첫 그리기부터 값이 있다", async () => {
    stubCanvas(alphaData({ x: 80, y: 80, width: 16, height: 16 }));
    await measureImageBounds("/bounds/hook-known.png");

    const { result } = renderHook(() => useItemBounds(["/bounds/hook-known.png"]));

    expect(result.current).toEqual(near({ x: 0.5, y: 0.5, width: 0.1, height: 0.1 }));
  });
});
