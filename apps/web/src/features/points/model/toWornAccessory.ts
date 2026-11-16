import type { WornAccessory } from "@/components/mascot/types";

import type { ShopItem } from "../types";
import { drawingExtras, hasDrawing } from "./drawing";

/**
 * 상점 상품을 공통 마스코트 부품이 그리는 모양으로 바꾸기
 *
 * 앞 그림도 뒤 그림도 없고 코드로 그리는 빛 효과도 아니면 그릴 것이 없어 null이다.
 */
export function toWornAccessory(item: ShopItem): WornAccessory | null {
  if (item.slot === undefined || !hasDrawing(item)) {
    return null;
  }
  return {
    slot: item.slot,
    ...(item.imageUrl === null ? null : { imageUrl: item.imageUrl }),
    ...drawingExtras(item),
  };
}
