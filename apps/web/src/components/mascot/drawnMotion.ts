/**
 * 코드로 그리는 효과 움직임의 이름
 *
 * 서버가 주는 effect_pieces.motion 값이며, 효과 그림 조각 위에 빛·입자·선·가림막을 코드로 더해 그린다.
 * 이 이름을 모르는 예전 웹은 멈춘 그림으로 그려서 웹을 먼저 배포한 뒤에 서버 값을 바꾼다.
 * 서버 값이 아직 예전 이름(pulse 등)이면 이 웹도 예전 움직임으로 그린다.
 */
const DRAWN_MOTIONS = [
  "glow",
  "ripple",
  "drift",
  "spread",
  "wipe",
  "spiral",
  "starry",
  "flow",
  "flash",
  "countdown",
] as const;

export type DrawnMotion = (typeof DRAWN_MOTIONS)[number];

export function isDrawnMotion(motion: string): motion is DrawnMotion {
  return (DRAWN_MOTIONS as readonly string[]).includes(motion);
}

/** 앞뒤 그림이 다 있는 효과에서 앞 그림 대신 뒤 그림(몸을 감싼 빛)을 잘라 움직이는 이름 */
export const BACK_LIGHT_MOTIONS: readonly string[] = ["glow", "ripple"];

/** 몸 둘레를 돌아 궤도 앞쪽 반이 몸 앞을 지나는 이름 */
export const ORBIT_MOTION = "spiral";
