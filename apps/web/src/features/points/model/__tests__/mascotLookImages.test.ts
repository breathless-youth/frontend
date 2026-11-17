import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MASCOT_EXPRESSION_SRC } from "@/components/mascot/mascotExpressions";

import {
  __resetMascotLookImagesForTests,
  imagesPreloaded,
  mascotLookImageUrls,
  preloadImages,
} from "../mascotLookImages";

const decode = vi.fn<() => Promise<void>>();

beforeEach(() => {
  __resetMascotLookImagesForTests();
  decode.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: decode,
  });
});

afterEach(() => {
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
});

describe("mascotLookImageUrls", () => {
  it("마스코트 표정 그림과 소품의 앞·뒤·효과 그림, 띠 그림을 한 번씩 담는다", () => {
    const urls = mascotLookImageUrls({
      id: "pencil",
      accessories: [
        { slot: "head", imageUrl: "/beret.png" },
        { slot: "wings", imageUrl: "/wings-front.png", backImageUrl: "/wings.png" },
        {
          slot: "set",
          imageUrl: "/hero.png",
          effectImageUrl: "/hero-fx.png",
          effectPieces: [
            {
              x: 0,
              y: 0,
              width: 1,
              height: 1,
              motion: "pulse",
              sprite: { url: "/fire.webp", frames: 12, durationMs: 1200 },
            },
          ],
        },
        { slot: "face", imageUrl: "/beret.png" },
        { slot: "effect", effectType: "aurora" },
      ],
    });

    expect(urls).toEqual([
      ...new Set(Object.values(MASCOT_EXPRESSION_SRC.pencil)),
      "/beret.png",
      "/wings-front.png",
      "/wings.png",
      "/hero.png",
      "/hero-fx.png",
      "/fire.webp",
    ]);
  });
});

describe("preloadImages", () => {
  it("받아 디코드한 그림을 끝난 것으로 기록하고 같은 주소는 다시 받지 않는다", async () => {
    expect(imagesPreloaded(["/a.png", "/b.png"])).toBe(false);

    await preloadImages(["/a.png", "/b.png"]);
    await preloadImages(["/a.png"]);

    expect(imagesPreloaded(["/a.png", "/b.png"])).toBe(true);
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it("받는 중인 그림을 또 부르면 같은 받기를 기다린다", async () => {
    let finish = () => {};
    decode.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));

    const first = preloadImages(["/a.png"]);
    const second = preloadImages(["/a.png"]);
    finish();
    await Promise.all([first, second]);

    expect(decode).toHaveBeenCalledOnce();
    expect(imagesPreloaded(["/a.png"])).toBe(true);
  });

  it("받지 못한 그림도 더 기다리지 않도록 끝난 것으로 보고 거부하지 않는다", async () => {
    decode.mockRejectedValueOnce(new Error("EncodingError"));

    await expect(preloadImages(["/broken.png"])).resolves.toBeUndefined();

    expect(imagesPreloaded(["/broken.png"])).toBe(true);
  });
});
