import { baseSearch } from "@/features/group-room/groupTabSearch";

/**
 * 포인트 화면 사이를 오갈 때의 쿼리
 *
 * 화면마다 `tab`의 뜻이 달라서 앞 화면의 탭은 떼고, 열 화면의 탭만 붙인다.
 */
export function pointsSearch(search: string, tab?: string): string {
  const params = new URLSearchParams(baseSearch(search));
  // 앞 화면에서 골라 둔 상품은 그 화면에서만 쓴다.
  params.delete("item");
  if (tab !== undefined) {
    params.set("tab", tab);
  }
  const out = params.toString();
  return out === "" ? "" : `?${out}`;
}

const ITEM_PARAM = "item";

/** 상점에서 누른 상품을 골라 둔 채로 여는 쿼리 */
export function pointsItemSearch(search: string, itemId?: string): string {
  if (itemId === undefined) {
    return pointsSearch(search);
  }
  const params = new URLSearchParams(pointsSearch(search));
  params.set(ITEM_PARAM, itemId);
  return `?${params.toString()}`;
}

/** 상점에서 누르고 들어온 상품의 id이며 바로 들어왔으면 null이다. */
export function pickedItemFrom(search: string): string | null {
  return new URLSearchParams(search).get(ITEM_PARAM);
}
