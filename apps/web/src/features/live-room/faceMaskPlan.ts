import type { FaceSpot } from "@/features/study-session/vision/faceSpot";

/**
 * 송신 합성기가 매 프레임 무엇을 그릴지 정하는 규칙
 *
 * 2D와 WebGL 합성기가 같은 규칙을 써서, 두 구현의 차이가 그리는 방식뿐이게 한다.
 * 이모지를 덮을 수 없는 순간에는 원본 얼굴이 나가지 않게 흐린다.
 */
export type MaskMode = "blur" | "sticker" | "plain";

export function maskModeOf(spot: FaceSpot | null, stickerReady: boolean): MaskMode {
  if (spot === null) {
    return "blur";
  }
  // 손·몸통만 보여 얼굴 모델이 얼굴을 못 찾은 경우다.
  // 가릴 얼굴이 없으니 선명하게 보낸다.
  if (!spot.visible) {
    return "plain";
  }
  return stickerReady ? "sticker" : "blur";
}

export interface StickerPlacement {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/** 15fps에서 약 1초면 목표의 90%에 닿는다. */
export const FOLLOW_PER_FRAME = 0.15;

/**
 * 이모지 따라가기
 *
 * 자리 갱신은 1~2초마다 오므로 매 프레임 조금씩 다가가 순간이동을 막는다.
 * 다시 나타날 때는 옛 자리에서 미끄러지지 않게 바로 놓는다.
 */
export function followSpot(current: StickerPlacement | null, target: FaceSpot): StickerPlacement {
  if (current === null) {
    return { x: target.x, y: target.y, size: target.size };
  }
  return {
    x: current.x + (target.x - current.x) * FOLLOW_PER_FRAME,
    y: current.y + (target.y - current.y) * FOLLOW_PER_FRAME,
    size: current.size + (target.size - current.size) * FOLLOW_PER_FRAME,
  };
}
