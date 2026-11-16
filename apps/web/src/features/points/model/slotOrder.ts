import type { AccessorySlot } from "../types";

/**
 * 칩이 놓이는 순서
 *
 * 세트는 결제로 사는 옷 한 세트라 맨 앞에 두고, 낱개는 위에서 아래로 몸을 훑는 차례다.
 */
export const SLOT_ORDER: readonly AccessorySlot[] = [
  "set",
  "head",
  "face",
  "body",
  "wings",
  "held",
  "underfoot",
  "effect",
];
