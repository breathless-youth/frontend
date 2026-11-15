import type { AccessorySlot, WornAccessory } from "./types";

/**
 * 소품이 겹치는 순서
 *
 * 뒤에서 앞으로 발밑, 날개, 마스코트 몸, 몸 소품, 얼굴, 머리, 물건, 효과 순서다.
 * 서버가 칸마다 그림 한 장만 주어서 머리와 효과는 몸 앞 조각만 그린다.
 * 목도리처럼 몸을 감싸는 소품의 뒤 조각과 효과의 뒤 조각이 생기면 BEHIND에 그 칸을 더한다.
 */
const BEHIND: readonly AccessorySlot[] = ["underfoot", "wings"];
const FRONT: readonly AccessorySlot[] = ["body", "face", "head", "held", "effect"];

function pick(accessories: readonly WornAccessory[], order: readonly AccessorySlot[]) {
  return order.flatMap((slot) => {
    // 한 칸에는 하나만 끼므로 같은 칸이 또 와도 먼저 온 것만 그린다.
    const worn = accessories.find((accessory) => accessory.slot === slot);
    return worn === undefined ? [] : [worn];
  });
}

export function splitAccessoryLayers(accessories: readonly WornAccessory[]): {
  behind: WornAccessory[];
  front: WornAccessory[];
} {
  return { behind: pick(accessories, BEHIND), front: pick(accessories, FRONT) };
}
