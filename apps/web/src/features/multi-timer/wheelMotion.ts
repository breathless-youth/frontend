/**
 * 휠이 손을 뗀 뒤 굴러가는 방식
 *
 * 저전력 모드의 iOS 웹뷰는 화면을 초당 30번만 그려서, 길게 미끄러지는 움직임이 툭툭 끊겨 보인다.
 * 그래서 실제 프레임 간격을 재 두고, 느리면 짧게 붙고 덜 굴러가는 움직임으로 바꾼다.
 */
export interface WheelMotion {
  readonly settleBaseMs: number;
  readonly settlePerRowMs: number;
  readonly settleMaxMs: number;
  /** 손을 뗄 때의 속도(칸/ms)에 곱해 더 굴릴 거리를 정한다. */
  readonly flingMs: number;
  readonly maxFlingRows: number;
}

export const SMOOTH_MOTION: WheelMotion = {
  settleBaseMs: 160,
  settlePerRowMs: 45,
  settleMaxMs: 600,
  flingMs: 160,
  maxFlingRows: 8,
};

export const LOW_FRAME_RATE_MOTION: WheelMotion = {
  settleBaseMs: 90,
  settlePerRowMs: 20,
  settleMaxMs: 240,
  flingMs: 90,
  maxFlingRows: 3,
};

/** 60Hz(16.7ms)와 30Hz(33.3ms) 사이에서 가른다. */
const LOW_FRAME_RATE_MS = 25;
/** 백그라운드에 다녀온 사이처럼 화면을 안 그린 공백은 프레임 간격이 아니다. */
const MAX_FRAME_INTERVAL_MS = 200;
const KEPT_INTERVALS = 30;

let intervals: number[] = [];

export function recordFrameInterval(ms: number): void {
  if (!(ms > 0) || ms > MAX_FRAME_INTERVAL_MS) return;
  intervals = [...intervals.slice(-(KEPT_INTERVALS - 1)), ms];
}

export function medianFrameInterval(): number | null {
  if (intervals.length === 0) return null;
  const sorted = [...intervals].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function motionForFrameInterval(ms: number | null): WheelMotion {
  return ms !== null && ms > LOW_FRAME_RATE_MS ? LOW_FRAME_RATE_MOTION : SMOOTH_MOTION;
}

export function settleDuration(motion: WheelMotion, rows: number): number {
  return Math.min(motion.settleMaxMs, motion.settleBaseMs + motion.settlePerRowMs * Math.abs(rows));
}

/** 휠 높이(300px)를 한 칸 높이(46px)로 나눈 값에 가까운 저항 기준 칸 수 */
const RUBBER_BAND_ROWS = 6.5;
const RUBBER_BAND_COEFF = 0.55;

/**
 * 끝을 넘겨 끈 위치
 *
 * 0에서 max 사이는 그대로 두고, 끝을 넘은 거리는 넘을수록 덜 따라오게 줄인다.
 * 그래서 끝에 닿았다는 것을 손가락으로 느낄 수 있다.
 */
export function rubberBand(position: number, max: number): number {
  const over = position < 0 ? -position : position - max;
  if (over <= 0) return position;
  const pulled = (1 - 1 / ((over * RUBBER_BAND_COEFF) / RUBBER_BAND_ROWS + 1)) * RUBBER_BAND_ROWS;
  return position < 0 ? -pulled : max + pulled;
}

/**
 * 몇 프레임 동안 화면이 그려지는 간격을 잰다
 *
 * 휠이 처음 움직이기 전에 간격을 알아야 첫 굴림부터 맞는 움직임을 고를 수 있다.
 * 돌려주는 함수로 남은 측정을 멈춘다.
 */
export function probeFrameInterval(
  frames: number,
  raf: (cb: FrameRequestCallback) => number = requestAnimationFrame,
  caf: (id: number) => void = cancelAnimationFrame,
): () => void {
  let previous: number | null = null;
  let left = frames;
  let id: number | null = null;
  const step = (now: number) => {
    if (previous !== null) {
      recordFrameInterval(now - previous);
      left -= 1;
    }
    previous = now;
    id = left > 0 ? raf(step) : null;
  };
  id = raf(step);
  return () => {
    if (id !== null) caf(id);
    id = null;
  };
}

export function __resetFrameIntervalsForTests(): void {
  intervals = [];
}
