import type { WornAccessory } from "@/components/mascot/types";

import type { MascotId, ShopItem } from "../types";
import { toWornAccessory } from "./toWornAccessory";

/**
 * 마스코트마다 지금 끼고 있는 소품
 *
 * 소품은 한 마스코트에만 속하고 서버는 고르지 않은 마스코트가 낀 소품도 착용 중으로 주므로, 상점 상품만으로 마스코트마다 꾸민 모습을 그린다.
 * 끼고 있는 소품이 없거나 그릴 것이 없는 마스코트는 목록에 없다.
 */
export function wornByMascot(items: readonly ShopItem[]): ReadonlyMap<MascotId, WornAccessory[]> {
  const worn = new Map<MascotId, WornAccessory[]>();
  for (const item of items) {
    if (item.kind !== "accessory" || !item.inUse || item.mascotId === undefined) {
      continue;
    }
    const drawn = toWornAccessory(item);
    if (drawn !== null) {
      worn.set(item.mascotId, [...(worn.get(item.mascotId) ?? []), drawn]);
    }
  }
  return worn;
}
