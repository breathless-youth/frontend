import { describe, expect, it } from "vitest";

import { splitAccessoryLayers } from "../mascotLayers";

const worn = (slot: Parameters<typeof splitAccessoryLayers>[0][number]["slot"]) => ({
  slot,
  imageUrl: `/${slot}.png`,
});

describe("splitAccessoryLayers", () => {
  it("효과·날개·발밑은 몸 뒤에, 나머지는 몸 앞에 정한 순서로 놓고 효과가 가장 뒤, 발밑이 날개보다 앞이다", () => {
    const layers = splitAccessoryLayers([
      worn("effect"),
      worn("held"),
      worn("head"),
      worn("face"),
      worn("body"),
      worn("wings"),
      worn("underfoot"),
    ]);

    expect(layers.behind.map((layer) => layer.slot)).toEqual(["effect", "wings", "underfoot"]);
    expect(layers.front.map((layer) => layer.slot)).toEqual(["body", "face", "head", "held"]);
  });

  it("같은 칸이 두 번 오면 먼저 온 것만 그린다", () => {
    const layers = splitAccessoryLayers([
      { slot: "head", imageUrl: "/first.png" },
      { slot: "head", imageUrl: "/second.png" },
    ]);

    expect(layers.front).toEqual([{ key: "head", slot: "head", imageUrl: "/first.png" }]);
  });

  it("뒤 조각이 있는 소품은 앞 조각은 몸 앞에, 뒤 조각은 몸 뒤에 둔다", () => {
    const layers = splitAccessoryLayers([
      { slot: "body", imageUrl: "/scarf.png", backImageUrl: "/scarf-back.png" },
      { slot: "wings", imageUrl: "/wings.png" },
    ]);

    expect(layers.behind.map((layer) => layer.imageUrl)).toEqual(["/wings.png", "/scarf-back.png"]);
    expect(layers.front.map((layer) => layer.imageUrl)).toEqual(["/scarf.png"]);
  });

  it("날개와 발밑에 뒤 그림이 따로 오면 뒤 그림은 몸 뒤에, 앞 그림은 몸 앞에 두고 둘 다 발밑이 날개보다 앞이다", () => {
    const layers = splitAccessoryLayers([
      { slot: "head", imageUrl: "/cap.png" },
      { slot: "body", imageUrl: "/coat.png" },
      { slot: "wings", imageUrl: "/bag-straps.png", backImageUrl: "/bag.png" },
      { slot: "underfoot", imageUrl: "/tube-front.png", backImageUrl: "/tube.png" },
    ]);

    expect(layers.behind.map((layer) => layer.key)).toEqual(["wings-back", "underfoot-back"]);
    expect(layers.behind.map((layer) => layer.imageUrl)).toEqual(["/bag.png", "/tube.png"]);
    expect(layers.front.map((layer) => layer.imageUrl)).toEqual([
      "/coat.png",
      "/bag-straps.png",
      "/tube-front.png",
      "/cap.png",
    ]);
  });

  it("날개와 발밑에 뒤 그림만 와도 몸 뒤에 그린다", () => {
    const layers = splitAccessoryLayers([{ slot: "wings", backImageUrl: "/cape.png" }]);

    expect(layers.behind.map((layer) => layer.imageUrl)).toEqual(["/cape.png"]);
    expect(layers.front).toEqual([]);
  });

  describe("효과 칸", () => {
    const pieces = [{ x: 0.1, y: 0.1, width: 0.2, height: 0.2, motion: "twinkle" }];

    it("뒤 그림만 오면 가장 뒤에 그리고 조각 정보를 뒤 그림에 붙인다", () => {
      const layers = splitAccessoryLayers([
        { slot: "wings", imageUrl: "/wings.png" },
        { slot: "effect", backImageUrl: "/aura.png", effectPieces: pieces },
      ]);

      expect(layers.behind).toEqual([
        { key: "effect-back", slot: "effect", imageUrl: "/aura.png", pieces },
        { key: "wings", slot: "wings", imageUrl: "/wings.png" },
      ]);
      expect(layers.front).toEqual([]);
    });

    it("뒤 그림만 오고 조각이 없으면 뒤 그림이 통째로 움직인다", () => {
      const layers = splitAccessoryLayers([{ slot: "effect", backImageUrl: "/backdrop.png" }]);

      expect(layers.behind).toEqual([
        { key: "effect-back", slot: "effect", imageUrl: "/backdrop.png", floats: true },
      ]);
    });

    it("앞뒤 그림이 다 오면 둘 다 가장 뒤에 뒤 그림, 앞 그림 순서로 두고 조각은 앞 그림에만 붙는다", () => {
      const layers = splitAccessoryLayers([
        { slot: "wings", imageUrl: "/wings.png" },
        { slot: "underfoot", imageUrl: "/mat.png" },
        { slot: "effect", imageUrl: "/stars.png", backImageUrl: "/sky.png", effectPieces: pieces },
      ]);

      expect(layers.behind).toEqual([
        { key: "effect-back", slot: "effect", imageUrl: "/sky.png" },
        { key: "effect", slot: "effect", imageUrl: "/stars.png", pieces },
        { key: "wings", slot: "wings", imageUrl: "/wings.png" },
        { key: "underfoot", slot: "underfoot", imageUrl: "/mat.png" },
      ]);
      expect(layers.front).toEqual([]);
    });

    it("앞뒤 그림이 다 오면 몸을 감싼 빛 조각은 뒤 그림을, 나머지 조각은 앞 그림을 자른다", () => {
      const sparkle = { x: 0.2, y: 0.2, width: 0.05, height: 0.05, motion: "drift" };
      const light = { x: 0.17, y: 0.23, width: 0.62, height: 0.5, motion: "ripple" };
      const layers = splitAccessoryLayers([
        {
          slot: "effect",
          imageUrl: "/sparkles.png",
          backImageUrl: "/aura.png",
          effectPieces: [sparkle, light],
        },
      ]);

      expect(layers.behind).toEqual([
        { key: "effect-back", slot: "effect", imageUrl: "/aura.png", pieces: [light] },
        { key: "effect", slot: "effect", imageUrl: "/sparkles.png", pieces: [sparkle] },
      ]);
    });

    it("보물 오라처럼 뒤 그림만 오면 glow 조각도 뒤 그림을 자른다", () => {
      const glow = { x: 0.16, y: 0.16, width: 0.67, height: 0.69, motion: "glow" };
      const layers = splitAccessoryLayers([
        { slot: "effect", backImageUrl: "/sun.png", effectPieces: [glow] },
      ]);

      expect(layers.behind).toEqual([
        { key: "effect-back", slot: "effect", imageUrl: "/sun.png", pieces: [glow] },
      ]);
    });

    it("몸 둘레를 도는 궤도 조각은 몸 뒤에 두고, 같은 조각을 몸 앞 가장 앞에 한 번 더 둔다", () => {
      const keys = [
        { x: 0.29, y: 0.65, width: 0.08, height: 0.08, motion: "spiral" },
        { x: 0.46, y: 0.63, width: 0.08, height: 0.09, motion: "spiral" },
      ];
      const layers = splitAccessoryLayers([
        { slot: "held", imageUrl: "/flag.png" },
        { slot: "effect", imageUrl: "/keys.png", effectPieces: keys },
        { slot: "wings", imageUrl: "/wings.png" },
      ]);

      expect(layers.behind).toEqual([
        { key: "effect", slot: "effect", imageUrl: "/keys.png", pieces: keys },
        { key: "wings", slot: "wings", imageUrl: "/wings.png" },
      ]);
      // 궤도 앞쪽 반은 들고 있는 물건까지 모든 소품보다 앞을 지난다.
      expect(layers.front).toEqual([
        { key: "held", slot: "held", imageUrl: "/flag.png" },
        {
          key: "effect-front",
          slot: "effect",
          imageUrl: "/keys.png",
          pieces: keys,
          orbitFront: true,
        },
      ]);
    });

    it("궤도 조각이 아닌 효과는 몸 앞에 그리지 않는다", () => {
      const layers = splitAccessoryLayers([
        {
          slot: "effect",
          backImageUrl: "/sky.png",
          effectPieces: [{ ...pieces[0], motion: "starry" }],
        },
      ]);

      expect(layers.front).toEqual([]);
    });

    it("앞 그림만 와도 몸 앞이 아니라 가장 뒤에 그리고 조각이 없으면 통째로 움직인다", () => {
      const layers = splitAccessoryLayers([
        { slot: "body", imageUrl: "/coat.png" },
        { slot: "effect", imageUrl: "/stars.png" },
      ]);

      expect(layers.behind[0]).toEqual({
        key: "effect",
        slot: "effect",
        imageUrl: "/stars.png",
        floats: true,
      });
      expect(layers.front.map((layer) => layer.slot)).toEqual(["body"]);
    });
  });

  describe("세트", () => {
    const pieces = [{ x: 0.1, y: 0.1, width: 0.2, height: 0.2, motion: "float" }];

    it("효과 그림은 세트 뒤 조각보다 뒤에 그리고 몸 앞에는 옷만 둔다", () => {
      const layers = splitAccessoryLayers([
        { slot: "head", imageUrl: "/cap.png" },
        {
          slot: "set",
          imageUrl: "/suit.png",
          backImageUrl: "/cape.png",
          effectImageUrl: "/sparks.png",
          effectPieces: pieces,
        },
      ]);

      expect(layers.wearsSet).toBe(true);
      expect(layers.behind).toEqual([
        { key: "set-effect", slot: "set", imageUrl: "/sparks.png", pieces },
        { key: "set-back", slot: "set", imageUrl: "/cape.png" },
      ]);
      expect(layers.front).toEqual([{ key: "set", slot: "set", imageUrl: "/suit.png" }]);
    });

    it("효과 그림의 궤도 조각은 옷보다 앞에 한 번 더 그린다", () => {
      const keys = [{ x: 0.3, y: 0.6, width: 0.08, height: 0.08, motion: "spiral" }];
      const layers = splitAccessoryLayers([
        { slot: "set", imageUrl: "/suit.png", effectImageUrl: "/keys.png", effectPieces: keys },
      ]);

      expect(layers.front).toEqual([
        { key: "set", slot: "set", imageUrl: "/suit.png" },
        {
          key: "set-effect-front",
          slot: "set",
          imageUrl: "/keys.png",
          pieces: keys,
          orbitFront: true,
        },
      ]);
    });

    it("효과 그림에 조각이 없으면 가장 뒤에서 통째로 움직인다", () => {
      const layers = splitAccessoryLayers([
        { slot: "set", imageUrl: "/suit.png", effectImageUrl: "/sparks.png" },
      ]);

      expect(layers.behind).toEqual([
        { key: "set-effect", slot: "set", imageUrl: "/sparks.png", floats: true },
      ]);
      expect(layers.front).toEqual([{ key: "set", slot: "set", imageUrl: "/suit.png" }]);
    });
  });
});
