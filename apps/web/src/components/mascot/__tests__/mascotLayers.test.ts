import { describe, expect, it } from "vitest";

import { splitAccessoryLayers } from "../mascotLayers";

const worn = (slot: Parameters<typeof splitAccessoryLayers>[0][number]["slot"]) => ({
  slot,
  imageUrl: `/${slot}.png`,
});

describe("splitAccessoryLayers", () => {
  it("발밑과 날개는 몸 뒤에, 나머지는 몸 앞에 정한 순서로 놓는다", () => {
    const layers = splitAccessoryLayers([
      worn("effect"),
      worn("held"),
      worn("head"),
      worn("face"),
      worn("body"),
      worn("wings"),
      worn("underfoot"),
    ]);

    expect(layers.behind.map((layer) => layer.slot)).toEqual(["underfoot", "wings"]);
    expect(layers.front.map((layer) => layer.slot)).toEqual([
      "body",
      "face",
      "head",
      "held",
      "effect",
    ]);
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
});
