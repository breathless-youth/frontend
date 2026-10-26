/**
 * 뽀모도로 다이얼의 각도·바퀴 계산
 *
 * 다이얼 한 바퀴가 60분이라 60분을 넘는 값은 바퀴 수와 마지막 바퀴의 채움 비율로 나눠 그린다.
 * 각도는 12시를 0도로 두고 시계 방향으로 잰다.
 */

const MINUTES_PER_LAP = 60;
const DEGREES_PER_MINUTE = 360 / MINUTES_PER_LAP;

export interface DialLimit {
  readonly min: number;
  readonly max: number;
}

export interface DialDrag {
  /** 12시를 지나 더해진 바퀴 수 */
  laps: number;
  /**
   * 직전 걸음의 분 눈금
   *
   * 움직이는 동안에는 0–59이고, 12시를 눌러 바퀴를 다 채웠으면 60이다.
   */
  prev: number;
}

/**
 * 분을 바퀴 수와 마지막 바퀴의 채움 비율로 나눈 값
 *
 * 딱 60분은 다음 바퀴의 빈 원이 아니라 꽉 찬 첫 바퀴로 보여야 해서 바퀴 경계를 올림으로 나눈다.
 */
export function dialFraction(minutes: number): { laps: number; fraction: number } {
  if (!(minutes > 0)) return { laps: 0, fraction: 0 };
  const laps = Math.ceil(minutes / MINUTES_PER_LAP) - 1;
  return { laps, fraction: (minutes - laps * MINUTES_PER_LAP) / MINUTES_PER_LAP };
}

/** 다이얼 중심 기준 좌표(아래가 +y)를 12시 기준 시계 방향 각도로 바꾼다. */
export function pointToDialAngle(x: number, y: number): number {
  const deg = (Math.atan2(x, -y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function angleToMinute(deg: number): number {
  const normalized = ((deg % 360) + 360) % 360;
  return Math.round(normalized / DEGREES_PER_MINUTE) % MINUTES_PER_LAP;
}

export function clampDialValue(value: number, limit: DialLimit): number {
  return Math.min(limit.max, Math.max(limit.min, value));
}

/**
 * 누른 자리로 정한 값과 이어 갈 드래그 상태
 *
 * 누름은 12시를 넘어간 것이 아니라 보이는 바퀴 안의 눈금을 고른 것이라 바퀴 수를 바꾸지 않는다.
 * 넘김 판정을 거치면 손잡이에서 먼 곳을 누른 것이 45분 뒤에서 15분 앞으로 넘어간 것으로 읽혀 한 바퀴가 더해진다.
 * 바퀴 경계를 `dialFraction`과 같게 둬서 딱 60분은 다음 바퀴가 아니라 다 찬 첫 바퀴로 본다.
 * 12시는 그 바퀴를 다 채운 자리로 읽어, 다 찬 바퀴의 손잡이를 잡아도 값이 그대로다.
 */
export function tapDialDrag(
  minutes: number,
  minute: number,
  limit: DialLimit,
): { drag: DialDrag; value: number } {
  const laps = Math.max(0, Math.ceil(minutes / MINUTES_PER_LAP) - 1);
  const prev = minute === 0 ? MINUTES_PER_LAP : minute;
  return { drag: { laps, prev }, value: clampDialValue(laps * MINUTES_PER_LAP + prev, limit) };
}

/**
 * 드래그 한 걸음의 바퀴 수와 값
 *
 * 12시를 시계 방향으로 넘으면 한 바퀴를 더하고 반대로 넘으면 뺀다.
 * 넘었는지는 직전 눈금이 45분 뒤쪽이고 지금 눈금이 15분 앞쪽인지로 판단해, 손가락이 빨라 눈금을 건너뛰어도 놓치지 않는다.
 * 바퀴 수는 상한이 담기는 만큼만 쌓아, 상한에서 더 돌린 뒤 되돌릴 때 헛바퀴를 풀지 않아도 된다.
 */
export function stepDialDrag(
  drag: DialDrag,
  minute: number,
  limit: DialLimit,
): { drag: DialDrag; value: number } {
  let laps = drag.laps;
  if (drag.prev > 45 && minute < 15) laps += 1;
  else if (drag.prev < 15 && minute > 45) laps = Math.max(0, laps - 1);
  laps = Math.min(laps, Math.floor(limit.max / MINUTES_PER_LAP));

  const raw = laps * MINUTES_PER_LAP + minute;
  // 0분은 시작할 수 없는 값이라 가장 작은 값으로 올린다.
  const value = clampDialValue(raw === 0 ? limit.min : raw, limit);
  return { drag: { laps, prev: minute }, value };
}

/** 다이얼 중심에서 반지름과 각도로 정한 viewBox 좌표 */
export function dialPoint(center: number, radius: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [center + radius * Math.sin(rad), center - radius * Math.cos(rad)];
}

/**
 * 12시부터 시계 방향으로 채운 부채꼴 경로
 *
 * 호 하나로는 한 바퀴를 그릴 수 없어 0 초과 1 미만의 비율만 받는다.
 */
export function wedgePath(center: number, radius: number, fraction: number): string {
  const sweep = fraction * 360;
  const [x, y] = dialPoint(center, radius, sweep);
  const largeArc = sweep > 180 ? 1 : 0;
  return `M${center} ${center}L${center} ${center - radius}A${radius} ${radius} 0 ${largeArc} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`;
}
