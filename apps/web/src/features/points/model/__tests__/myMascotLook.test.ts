import { describe, expect, it } from "vitest";

import type { Mascot, ShopData, ShopItem } from "../../types";
import { toMyMascotLook } from "../myMascotLook";

const mascot = (id: Mascot["id"], selected: boolean): Mascot => ({
  id,
  unlockFocusSec: 0,
  unlocked: true,
  selected,
  newlyUnlocked: false,
});

const accessory = (over: Partial<ShopItem>): ShopItem => ({
  id: "1",
  kind: "accessory",
  name: "베레모",
  imageUrl: "/beret.png",
  acquire: { type: "price", price: 100 },
  owned: true,
  inUse: true,
  mascotId: "book",
  slot: "head",
  ...over,
});

const shop = (over: Partial<ShopData>): ShopData => ({
  items: [],
  mascots: [mascot("stopwatch", false), mascot("book", true)],
  totalFocusSec: 0,
  ...over,
});

describe("toMyMascotLook", () => {
  it("고른 마스코트와 그 마스코트가 낀 소품만 담는다", () => {
    const look = toMyMascotLook(
      shop({
        items: [
          accessory({}),
          accessory({ id: "2", slot: "face", inUse: false }),
          accessory({ id: "3", slot: "body", mascotId: "pencil" }),
          accessory({ id: "4", slot: "wings", imageUrl: null }),
        ],
      }),
    );

    expect(look).toEqual({ id: "book", accessories: [{ slot: "head", imageUrl: "/beret.png" }] });
  });

  it("고른 마스코트가 없으면 null이다", () => {
    expect(toMyMascotLook(shop({ mascots: [mascot("book", false)] }))).toBeNull();
  });
});
