import type { ShopItem } from "../types";

/**
 * 미리 보기에 겹칠 상품 고르기
 *
 * 세트와 낱개 소품은 함께 끼지 못해서 입으면 서버가 반대쪽을 벗긴다.
 * 그 결과와 같게 세트를 고르면 세트만, 낱개를 고르면 끼고 있던 세트를 뺀 낱개만 보인다.
 */
export function previewLayers(item: ShopItem | null, worn: readonly ShopItem[]): ShopItem[] {
  if (item === null) {
    return [...worn];
  }
  if (item.slot === "set") {
    return [item];
  }
  return [...worn.filter((other) => other.slot !== item.slot && other.slot !== "set"), item];
}
