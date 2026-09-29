/**
 * 세션 화면의 메인 스레드 막힘 집계
 *
 * 측정 빌드 전용이다.
 * `components/VisionPerfPanel.tsx`만 쓰므로 운영 빌드에서는 번들에서 빠진다.
 * ① 시작 직후 최장 멈춤: 문서 시작 뒤 30초 안에 끝난 `requestAnimationFrame` 간격의 최댓값
 * ② 안정 구간 막힘: 검출기 준비 뒤 60초 동안 시작한 Long Task의 50 ms 초과분 합계와 건수, Chromium 전용
 * ③ 프레임 누락: 같은 60초 안에서 시작하고 끝난 rAF 간격 중 50 ms를 넘은 횟수
 */

export const STARTUP_WINDOW_MS = 30_000;
export const STEADY_WINDOW_MS = 60_000;
/** Long Task 기준인 50 ms와 같다. 이 몫을 넘은 만큼이 입력·그리기를 막은 시간이다. */
const LONG_TASK_BUDGET_MS = 50;
const FRAME_GAP_LIMIT_MS = 50;

export interface LongTaskSample {
  readonly startTime: number;
  readonly duration: number;
}

export interface MainThreadSummary {
  readonly startupMaxGapMs: number;
  /** WebKit처럼 Long Task를 지원하지 않는 엔진은 null. */
  readonly longTaskExcessMs: number | null;
  readonly longTaskCount: number | null;
  readonly frameGapsOver50: number;
  /** 안정 구간 60초가 다 찼는가. 하네스는 이 값이 true가 된 뒤에 읽는다. */
  readonly complete: boolean;
}

export function summarizeMainThread(input: {
  /** rAF 콜백의 문서 시각, 오름차순. */
  readonly frames: readonly number[];
  readonly longTasks: readonly LongTaskSample[] | null;
  readonly readyAtMs: number | null;
  readonly nowMs: number;
}): MainThreadSummary {
  const { frames, longTasks, readyAtMs, nowMs } = input;
  const steadyEnd = readyAtMs === null ? null : readyAtMs + STEADY_WINDOW_MS;

  let startupMaxGapMs = 0;
  let frameGapsOver50 = 0;
  let previous: number | null = null;
  for (const at of frames) {
    if (previous !== null) {
      const gap = at - previous;
      if (at <= STARTUP_WINDOW_MS) {
        startupMaxGapMs = Math.max(startupMaxGapMs, gap);
      }
      if (
        readyAtMs !== null &&
        steadyEnd !== null &&
        previous >= readyAtMs &&
        at <= steadyEnd &&
        gap > FRAME_GAP_LIMIT_MS
      ) {
        frameGapsOver50 += 1;
      }
    }
    previous = at;
  }

  const steadyTasks =
    longTasks === null || readyAtMs === null || steadyEnd === null
      ? []
      : longTasks.filter((task) => task.startTime >= readyAtMs && task.startTime < steadyEnd);

  return {
    startupMaxGapMs: Math.round(startupMaxGapMs),
    longTaskExcessMs:
      longTasks === null
        ? null
        : Math.round(
            steadyTasks.reduce(
              (sum, task) => sum + Math.max(0, task.duration - LONG_TASK_BUDGET_MS),
              0,
            ),
          ),
    longTaskCount: longTasks === null ? null : steadyTasks.length,
    frameGapsOver50,
    complete: steadyEnd !== null && nowMs >= steadyEnd,
  };
}

export interface MainThreadRecorder {
  summarize(readyAtMs: number | null): MainThreadSummary;
}

let recorder: MainThreadRecorder | null = null;

/**
 * 문서당 하나인 메인 스레드 기록기
 *
 * 패널이 처음 뜰 때 기록을 시작해 문서가 끝날 때까지 둔다.
 * rAF를 계속 돌리므로 측정 빌드에서만 쓰고 운영 빌드에 넣지 않는다.
 */
export function mainThreadRecorder(): MainThreadRecorder {
  if (recorder !== null) {
    return recorder;
  }
  const frames: number[] = [];
  const onFrame = (at: number) => {
    frames.push(at);
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);

  let longTasks: LongTaskSample[] | null = null;
  if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
    const collected: LongTaskSample[] = [];
    longTasks = collected;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        collected.push({ startTime: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: "longtask" });
  }

  recorder = {
    summarize: (readyAtMs) =>
      summarizeMainThread({ frames, longTasks, readyAtMs, nowMs: performance.now() }),
  };
  return recorder;
}
