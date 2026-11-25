import { describe, expect, it } from "vitest";

import type { ShopItem } from "../../types";
import { previewLayers } from "../previewLayers";

function item(id: string, slot: ShopItem["slot"]): ShopItem {
  return {
    id,
    kind: "accessory",
    name: id,
    imageUrl: `/${id}.png`,
    acquire: { type: "price", price: 100 },
    owned: true,
    inUse: true,
    mascotId: "book",
    slot,
  };
}

describe("previewLayers", () => {
  const hat = item("hat", "head");
  const coat = item("coat", "body");
  const frog = item("frog", "set");

  it("낱개를 고르면 같은 칸 소품만 바꿔 끼운다", () => {
    expect(previewLayers(item("cap", "head"), [hat, coat]).map((it) => it.id)).toEqual([
      "coat",
      "cap",
    ]);
  });

  it("세트를 고르면 끼고 있던 낱개 없이 세트만 보인다", () => {
    expect(previewLayers(frog, [hat, coat]).map((it) => it.id)).toEqual(["frog"]);
  });

  it("세트를 입은 채 낱개를 고르면 세트를 벗은 모습으로 보인다", () => {
    expect(previewLayers(hat, [frog]).map((it) => it.id)).toEqual(["hat"]);
  });

  it("고른 것이 없으면 끼고 있는 그대로 보인다", () => {
    expect(previewLayers(null, [frog]).map((it) => it.id)).toEqual(["frog"]);
  });
});
