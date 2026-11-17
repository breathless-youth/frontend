/** 싱글룸 카메라 표시 모드. 작은 창, 키운 화면, 카메라를 숨긴 심플 모드다. */
export type CameraView = "pip" | "expanded" | "simple";

export interface DisplayUsageSnapshot {
  readonly pipSec: number;
  readonly expandedSec: number;
  readonly simpleSec: number;
  readonly pipExpandCount: number;
}

export interface DisplayUsage {
  /** 바뀐 화면을 알리고 직전 화면과 그 화면에 머문 초를 돌려준다. 같은 화면이면 null이다. */
  switchTo(view: CameraView): { from: CameraView; sec: number } | null;
  /** 지금 머무는 화면의 진행 중 시간까지 더한 누적값 */
  snapshot(): DisplayUsageSnapshot;
}

/**
 * 화면 표시 모드별 머문 시간
 *
 * 배경음 사용량처럼 화면이 만들어 세션 훅에 넘기고, 세션 훅은 종료 순간 한 번 읽는다.
 * 초는 반올림해서 이벤트 값이 정수로 나간다.
 */
export function createDisplayUsage(
  now: () => number,
  initial: CameraView = "simple",
): DisplayUsage {
  const totalsMs: Record<CameraView, number> = { pip: 0, expanded: 0, simple: 0 };
  let view = initial;
  let sinceMs = now();
  let expandCount = 0;
  return {
    switchTo(next) {
      if (next === view) return null;
      const at = now();
      const spentMs = at - sinceMs;
      totalsMs[view] += spentMs;
      const from = view;
      if (from === "pip" && next === "expanded") expandCount += 1;
      view = next;
      sinceMs = at;
      return { from, sec: Math.round(spentMs / 1000) };
    },
    snapshot() {
      const live = { ...totalsMs, [view]: totalsMs[view] + now() - sinceMs };
      return {
        pipSec: Math.round(live.pip / 1000),
        expandedSec: Math.round(live.expanded / 1000),
        simpleSec: Math.round(live.simple / 1000),
        pipExpandCount: expandCount,
      };
    },
  };
}
