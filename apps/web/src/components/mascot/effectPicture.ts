import type { CSSProperties } from "react";

import type { EffectPiece } from "./types";

/** 판 위의 사각형 자리이며 값은 판 한 변에 대한 비율이다. */
export type BoardRect = Pick<EffectPiece, "x" | "y" | "width" | "height">;

/** 비율을 CSS 퍼센트 글자로 바꾸며 긴 소수는 넷째 자리에서 끊는다. */
export function percent(ratio: number) {
  return `${Number((ratio * 100).toFixed(4))}%`;
}

/** 사각형이 판의 어디에 있는지를 배경 위치 값으로 바꾸며 판을 꽉 채운 사각형은 밀 곳이 없어 0이다. */
function backgroundOffset(start: number, size: number) {
  return size >= 1 ? "0%" : percent(start / (1 - size));
}

/** 판 크기 상자 안에서 사각형이 차지하는 자리 */
export function rectBox(rect: BoardRect): CSSProperties {
  return {
    left: percent(rect.x),
    top: percent(rect.y),
    width: percent(rect.width),
    height: percent(rect.height),
  };
}

/** 판 그림 한 장을 배경으로 깔고 그 사각형 자리만 보이게 하는 배경 값 */
export function rectPicture(imageUrl: string, rect: BoardRect): CSSProperties {
  return {
    backgroundImage: `url(${imageUrl})`,
    backgroundSize: `${percent(1 / rect.width)} ${percent(1 / rect.height)}`,
    backgroundPosition: `${backgroundOffset(rect.x, rect.width)} ${backgroundOffset(rect.y, rect.height)}`,
  };
}
