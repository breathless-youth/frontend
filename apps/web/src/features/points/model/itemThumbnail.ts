import type { ShopItem } from "../types";

/**
 * 상점 칸과 목록에 보일 상품 그림
 *
 * 오라나 뒤 배경 같은 효과는 앞 그림 없이 뒤 그림만 있어서 그때는 뒤 그림을 보인다.
 */
export function itemThumbnail(item: Pick<ShopItem, "imageUrl" | "backImageUrl">): string | null {
  return item.imageUrl ?? item.backImageUrl ?? null;
}
