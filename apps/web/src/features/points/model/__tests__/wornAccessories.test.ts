import { describe, expect, it } from "vitest";

import type { ShopItem } from "../../types";
import { wornByMascot } from "../wornAccessories";

function accessory(id: string, extra: Partial<ShopItem>): ShopItem {
  return {
    id,
    kind: "accessory",
    name: id,
    imageUrl: `/${id}.png`,
    acquire: { type: "price", price: 100 },
    owned: true,
    inUse: true,
    mascotId: "stopwatch",
    slot: "head",
    ...extra,
  };
}

describe("wornByMascot", () => {
  it("마스코트마다 낀 소품을 모으고 고르지 않은 마스코트의 소품도 담는다", () => {
    const worn = wornByMascot([
      accessory("cap", { mascotId: "stopwatch", slot: "head" }),
      accessory("glasses", { mascotId: "stopwatch", slot: "face" }),
      accessory("mug", { mascotId: "planner", slot: "held" }),
      accessory("set", {
        mascotId: "pencil",
        slot: "set",
        backImageUrl: "/set-back.png",
        effectImageUrl: "/set-effect.png",
      }),
    ]);

    expect(worn.get("stopwatch")).toEqual([
      { slot: "head", imageUrl: "/cap.png" },
      { slot: "face", imageUrl: "/glasses.png" },
    ]);
    expect(worn.get("planner")).toEqual([{ slot: "held", imageUrl: "/mug.png" }]);
    expect(worn.get("pencil")).toEqual([
      {
        slot: "set",
        imageUrl: "/set.png",
        backImageUrl: "/set-back.png",
        effectImageUrl: "/set-effect.png",
      },
    ]);
  });

  it("끼지 않은 소품, 타이머 배경, 그릴 것이 없는 소품은 뺀다", () => {
    const worn = wornByMascot([
      accessory("owned-only", { inUse: false }),
      accessory("no-drawing", { mascotId: "lamp", imageUrl: null }),
      {
        id: "bg",
        kind: "timerBackground",
        name: "배경",
        imageUrl: "/bg.png",
        acquire: { type: "price", price: 300 },
        owned: true,
        inUse: true,
      },
    ]);

    expect(worn.get("stopwatch")).toBeUndefined();
    expect(worn.get("lamp")).toBeUndefined();
    expect(worn.size).toBe(0);
  });
});
