import type { WornAccessory } from "@/components/mascot/types";

import type { ShopItem } from "../types";

/**
 * 상점 상품을 공통 마스코트 부품이 그리는 모양으로 바꾸기
 *
 * 그림도 없고 코드로 그리는 빛 효과도 아니면 그릴 것이 없어 null이다.
 */
export function toWornAccessory(item: ShopItem): WornAccessory | null {
  if (item.slot === undefined || (item.imageUrl === null && item.effectType === undefined)) {
    return null;
  }
  return {
    slot: item.slot,
    ...(item.imageUrl === null ? null : { imageUrl: item.imageUrl }),
    ...(item.backImageUrl ? { backImageUrl: item.backImageUrl } : null),
    ...(item.effectImageUrl ? { effectImageUrl: item.effectImageUrl } : null),
    ...(item.effectPieces ? { effectPieces: item.effectPieces } : null),
    ...(item.effectType ? { effectType: item.effectType } : null),
  };
}
