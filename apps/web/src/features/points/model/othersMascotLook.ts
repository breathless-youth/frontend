import type { MascotAppearance } from "@focusmakers/types";

import type { MascotLook } from "@/components/mascot/types";
import { isPointsEnabled } from "@/lib/pointsCapability";

import { toMascotLook } from "../gateway/fromApi";

/**
 * 다른 사람의 마스코트 모습
 *
 * 랭킹 줄과 멀티룸 멤버에 실려 오는 모습을 그릴 수 있는 모양으로 바꾼다.
 * 서버는 고른 적이 없는 사람에게도 첫 마스코트를 실어 보내므로, 포인트를 열지 않은 곳에서는 지금 기본 그림이 그대로 보이게 null을 준다.
 */
export function toOthersMascotLook(
  appearance: MascotAppearance | null | undefined,
): MascotLook | null {
  if (appearance == null || !isPointsEnabled()) {
    return null;
  }
  return toMascotLook(appearance);
}
