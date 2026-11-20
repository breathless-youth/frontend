export interface GuideRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const GUIDE_CARD_WIDTH = 320;
const GAP = 16;
const INSET = 16;

/**
 * 비추는 자리 옆 안내 카드 자리
 *
 * 카드 높이를 재지 않으려고 비추는 자리가 위쪽 반이면 카드 위 끝을, 아래쪽 반이면 아래 끝을 그 자리에 맞춘다.
 * 왼쪽에 카드가 들어갈 틈이 있으면 왼쪽, 없으면 오른쪽에 두고 상자 안쪽으로 당긴다.
 * 비출 자리가 없으면 null이고 카드는 가운데에 선다.
 */
export function guideCardPosition(
  spot: GuideRect | null,
  box: { width: number; height: number },
): ({ left: number } & ({ top: number } | { bottom: number })) | null {
  if (spot === null) return null;
  const leftSide = spot.left - GAP - GUIDE_CARD_WIDTH;
  const left =
    leftSide >= INSET
      ? leftSide
      : Math.min(spot.left + spot.width + GAP, box.width - GUIDE_CARD_WIDTH - INSET);
  const upper = spot.top + spot.height / 2 < box.height / 2;
  return upper
    ? { left, top: Math.max(INSET, spot.top) }
    : { left, bottom: Math.max(INSET, box.height - spot.top - spot.height) };
}

/**
 * 상자 기준으로 잰 비출 자리
 *
 * 숨긴 카메라 창처럼 막힌 자리나 접힌 패널처럼 크기가 없는 자리는 비추지 않는다.
 */
export function spotOf(box: HTMLElement, target: string | null): GuideRect | null {
  if (target === null) return null;
  const element = box.querySelector(`[data-pc-guide="${target}"]`);
  if (element === null || element.closest("[inert]") !== null) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const origin = box.getBoundingClientRect();
  return {
    left: rect.left - origin.left,
    top: rect.top - origin.top,
    width: rect.width,
    height: rect.height,
  };
}
