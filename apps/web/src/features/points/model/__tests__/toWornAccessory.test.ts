import { describe, expect, it } from "vitest";

import type { ShopItem } from "../../types";
import { itemThumbnail } from "../itemThumbnail";
import { toWornAccessory } from "../toWornAccessory";

function item(over: Partial<ShopItem>): ShopItem {
  return {
    id: "aura",
    kind: "accessory",
    name: "오라",
    imageUrl: null,
    acquire: { type: "price", price: 100 },
    owned: false,
    inUse: false,
    mascotId: "book",
    slot: "effect",
    ...over,
  };
}

describe("toWornAccessory", () => {
  it("앞 그림 없이 뒤 그림만 있는 소품도 그릴 수 있다", () => {
    const pieces = [{ x: 0, y: 0, width: 1, height: 1, motion: "pulse" }];
    expect(toWornAccessory(item({ backImageUrl: "/aura.png", effectPieces: pieces }))).toEqual({
      slot: "effect",
      backImageUrl: "/aura.png",
      effectPieces: pieces,
    });
  });

  it("앞 그림도 뒤 그림도 빛 효과도 없으면 그릴 것이 없다", () => {
    expect(toWornAccessory(item({}))).toBeNull();
    expect(toWornAccessory(item({ backImageUrl: null }))).toBeNull();
  });
});

describe("itemThumbnail", () => {
  it("앞 그림이 있으면 앞 그림을, 없으면 뒤 그림을 보인다", () => {
    expect(itemThumbnail(item({ imageUrl: "/front.png", backImageUrl: "/back.png" }))).toBe(
      "/front.png",
    );
    expect(itemThumbnail(item({ backImageUrl: "/back.png" }))).toBe("/back.png");
  });

  it("그림이 하나도 없으면 null이다", () => {
    expect(itemThumbnail(item({}))).toBeNull();
    expect(itemThumbnail(item({ backImageUrl: null }))).toBeNull();
  });
});
