/**
 * 사진 배경의 크기·위치 조정값
 *
 * `scale`은 화면을 덮는 크기에 곱하는 배율(1~3)이다.
 * `x`·`y`는 넘친 부분 중 어디를 보일지를 0~100%로 나타낸다(50이 가운데).
 */
export interface PhotoFit {
  scale: number;
  x: number;
  y: number;
}

export const DEFAULT_FIT: PhotoFit = { scale: 1, x: 50, y: 50 };

const MIN_SCALE = 1;
const MAX_SCALE = 3;

interface Size {
  width: number;
  height: number;
}

/** 제스처를 시작한 순간의 조정값과 손가락 중심·두 손가락 거리(한 손가락이면 0) */
export interface GestureBase {
  fit: PhotoFit;
  cx: number;
  cy: number;
  dist: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 끌기·두 손가락 벌리기로 바뀐 조정값
 *
 * 사진이 화면을 덮는 크기에 배율을 곱한 뒤 화면보다 넘친 길이만큼만 움직일 수 있다.
 * 넘치지 않는 방향은 가운데에 둔다.
 * `frame`은 화면에 보이는 크기라, 미리보기처럼 줄여 그린 화면에서도 손가락이 움직인 만큼 사진이 따라온다.
 */
export function panZoom(
  base: GestureBase,
  now: { cx: number; cy: number; dist: number },
  frame: Size,
  photo: Size,
): PhotoFit {
  const scale =
    base.dist > 0 && now.dist > 0
      ? clamp(base.fit.scale * (now.dist / base.dist), MIN_SCALE, MAX_SCALE)
      : base.fit.scale;
  const cover = Math.max(frame.width / photo.width, frame.height / photo.height) * scale;
  const overX = photo.width * cover - frame.width;
  const overY = photo.height * cover - frame.height;
  const dx = now.cx - base.cx;
  const dy = now.cy - base.cy;
  return {
    scale,
    x: overX > 0.5 ? clamp(base.fit.x - (dx / overX) * 100, 0, 100) : 50,
    y: overY > 0.5 ? clamp(base.fit.y - (dy / overY) * 100, 0, 100) : 50,
  };
}
