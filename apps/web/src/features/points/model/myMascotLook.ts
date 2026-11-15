import type { MascotLook } from "@/components/mascot/types";

import type { ShopData } from "../types";

/**
 * 상점 데이터에서 내 마스코트 모습 읽기
 *
 * 메모리 가짜 경계가 꾸미기 조회를 흉내 낼 때 쓴다.
 * 고른 마스코트와 그 마스코트가 지금 끼고 있는 소품만 담는다.
 * 그림 주소가 없는 소품은 그릴 수 없어 뺀다.
 */
export function toMyMascotLook(shop: ShopData): MascotLook | null {
  const selected = shop.mascots.find((mascot) => mascot.selected);
  if (selected === undefined) {
    return null;
  }
  return {
    id: selected.id,
    accessories: shop.items.flatMap((item) =>
      item.kind === "accessory" &&
      item.inUse &&
      item.mascotId === selected.id &&
      item.slot !== undefined &&
      item.imageUrl !== null
        ? [{ slot: item.slot, imageUrl: item.imageUrl }]
        : [],
    ),
  };
}
