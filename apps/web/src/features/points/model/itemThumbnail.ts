import type { ShopItem } from "../types";

/**
 * 상점 칸과 목록에 보일 상품 그림
 *
 * 오라나 뒤 배경 같은 효과는 앞 그림 없이 뒤 그림만 있어서 그때는 뒤 그림을 보인다.
 */
export function itemThumbnail(item: Pick<ShopItem, "imageUrl" | "backImageUrl">): string | null {
  return item.imageUrl ?? item.backImageUrl ?? null;
}

/**
 * 소품 칸에 겹쳐 그릴 그림을 뒤에서 앞 순서로
 *
 * 날개처럼 뒤 그림이 본체이고 앞 그림이 끈 조각인 소품도 있어서 한 장만 보이면 무엇인지 알기 어렵다.
 * 그래서 뒤 그림, 앞 그림, 세트의 효과 그림을 모두 겹친다.
 */
export function itemLayers(
  item: Pick<ShopItem, "imageUrl" | "backImageUrl" | "effectImageUrl">,
): string[] {
  return [item.backImageUrl, item.imageUrl, item.effectImageUrl].filter(
    (url): url is string => typeof url === "string" && url !== "",
  );
}
