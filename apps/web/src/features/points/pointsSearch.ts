import { baseSearch } from "@/features/group-room/groupTabSearch";

/**
 * 포인트 화면 사이를 오갈 때의 쿼리
 *
 * 화면마다 `tab`의 뜻이 달라서 앞 화면의 탭은 떼고, 열 화면의 탭만 붙인다.
 */
export function pointsSearch(search: string, tab?: string): string {
  const params = new URLSearchParams(baseSearch(search));
  if (tab !== undefined) {
    params.set("tab", tab);
  }
  const out = params.toString();
  return out === "" ? "" : `?${out}`;
}
