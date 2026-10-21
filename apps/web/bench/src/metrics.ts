import type { BenchClass, LabelSegment } from "./labels";
import { BENCH_CLASSES, labelAt } from "./labels";

/**
 * 예측 vs 정답 지표 — 순수 함수만 있다.
 *
 * 예측은 세션 타임라인(프로덕션 `sessionTimeline.ts`가 만든 구간)을 그대로 받는다.
 * 비교는 `GRID_MS` 격자로 한다. 정답이 바뀌는 경계 앞뒤 `toleranceMs`는 빼고 셀 수 있다 —
 * 유지시간(자리 이탈 2초, 졸음 10초 등) 때문에 생기는 지연은 별도 지표(이벤트 지연)로 본다.
 */

export const GRID_MS = 100;

export interface PredSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly label: BenchClass;
}

export type Confusion = Record<BenchClass, Record<BenchClass, number>>;

export interface ClassScore {
  readonly precision: number | null;
  readonly recall: number | null;
  readonly f1: number | null;
  /** 정답 기준 이 클래스의 시간(초). */
  readonly supportSec: number;
}

export interface EventScore {
  readonly label: Exclude<BenchClass, "FOCUS">;
  readonly gtEvents: number;
  readonly detected: number;
  /** 감지된 정답 이벤트의 평균 지연(초): 예측 시작 − 정답 시작. */
  readonly meanLatencySec: number | null;
  readonly maxLatencySec: number | null;
  /** 같은 라벨의 정답과 전혀 겹치지 않는 예측 구간 수. */
  readonly falseAlarms: number;
}

export interface ClipMetrics {
  /** 라벨이 있고 경계 허용 구간 밖인, 실제로 채점한 시간(초). */
  readonly scoredSec: number;
  readonly accuracy: number | null;
  readonly confusionSec: Confusion;
  readonly perClass: Record<BenchClass, ClassScore>;
  readonly macroF1: number | null;
  /** 정답이 FOCUS인 시간(초) — 경계 허용 없이 라벨 전체 기준. */
  readonly gtFocusSec: number;
  /** 라벨이 있는 구간에서 예측이 FOCUS인 시간(초). */
  readonly predFocusSec: number;
  /** 순공 과대 계상: 실제는 비집중인데 집중으로 센 시간(초). */
  readonly overCountSec: number;
  /** 순공 과소 계상: 실제는 집중인데 비집중으로 뺀 시간(초). */
  readonly underCountSec: number;
  readonly events: EventScore[];
}

function emptyConfusion(): Confusion {
  const confusion = {} as Confusion;
  for (const gt of BENCH_CLASSES) {
    confusion[gt] = { FOCUS: 0, AWAY: 0, PHONE: 0, SLEEP: 0 };
  }
  return confusion;
}

export function predAt(segments: readonly PredSegment[], atMs: number): BenchClass {
  for (const segment of segments) {
    if (atMs >= segment.startMs && atMs < segment.endMs) {
      return segment.label;
    }
  }
  return "FOCUS";
}

function nearBoundary(boundaries: readonly number[], atMs: number, toleranceMs: number): boolean {
  if (toleranceMs <= 0) {
    return false;
  }
  return boundaries.some((b) => Math.abs(atMs - b) < toleranceMs);
}

/** 정답이 바뀌는 시각들. 라벨이 시작·끝나는 지점도 포함한다. */
function labelBoundaries(gt: readonly LabelSegment[]): number[] {
  const set = new Set<number>();
  for (const segment of gt) {
    set.add(segment.startMs);
    set.add(segment.endMs);
  }
  return [...set];
}

/** 같은 라벨이 이어 붙은 정답 구간을 하나로 합친다(이벤트 단위 비교용). */
function mergeSegments<T extends { startMs: number; endMs: number; label: BenchClass }>(
  segments: readonly T[],
): { startMs: number; endMs: number; label: BenchClass }[] {
  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
  const merged: { startMs: number; endMs: number; label: BenchClass }[] = [];
  for (const segment of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.label === segment.label && segment.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, segment.endMs);
    } else {
      merged.push({ startMs: segment.startMs, endMs: segment.endMs, label: segment.label });
    }
  }
  return merged;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function scoreClasses(confusion: Confusion): {
  perClass: Record<BenchClass, ClassScore>;
  macroF1: number | null;
} {
  const perClass = {} as Record<BenchClass, ClassScore>;
  const f1s: number[] = [];
  for (const cls of BENCH_CLASSES) {
    const tp = confusion[cls][cls];
    let gtTotal = 0;
    let predTotal = 0;
    for (const other of BENCH_CLASSES) {
      gtTotal += confusion[cls][other];
      predTotal += confusion[other][cls];
    }
    const precision = ratio(tp, predTotal);
    const recall = ratio(tp, gtTotal);
    const f1 =
      precision !== null && recall !== null && precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : precision === 0 || recall === 0
          ? 0
          : null;
    if (gtTotal > 0 && f1 !== null) {
      f1s.push(f1);
    }
    perClass[cls] = { precision, recall, f1, supportSec: gtTotal };
  }
  return {
    perClass,
    macroF1: f1s.length > 0 ? f1s.reduce((a, b) => a + b, 0) / f1s.length : null,
  };
}

export interface MetricOptions {
  readonly toleranceMs: number;
  /** 정답 이벤트가 끝난 뒤에도 이만큼까지 시작한 예측은 감지로 인정한다(졸음 10초 유지시간 등). */
  readonly eventGraceMs: number;
}

export function computeClipMetrics(
  gt: readonly LabelSegment[],
  pred: readonly PredSegment[],
  durationMs: number,
  options: MetricOptions,
): ClipMetrics {
  const confusion = emptyConfusion();
  const boundaries = labelBoundaries(gt);
  let scoredMs = 0;
  let correctMs = 0;
  let gtFocusMs = 0;
  let predFocusMs = 0;
  let overMs = 0;
  let underMs = 0;

  for (let t = 0; t < durationMs; t += GRID_MS) {
    const mid = t + GRID_MS / 2;
    const truth = labelAt(gt, mid);
    if (truth === null) {
      continue;
    }
    const guess = predAt(pred, mid);
    const step = Math.min(GRID_MS, durationMs - t);
    if (truth === "FOCUS") {
      gtFocusMs += step;
    }
    if (guess === "FOCUS") {
      predFocusMs += step;
    }
    if (truth !== "FOCUS" && guess === "FOCUS") {
      overMs += step;
    }
    if (truth === "FOCUS" && guess !== "FOCUS") {
      underMs += step;
    }
    if (nearBoundary(boundaries, mid, options.toleranceMs)) {
      continue;
    }
    confusion[truth][guess] += step / 1000;
    scoredMs += step;
    if (truth === guess) {
      correctMs += step;
    }
  }

  const { perClass, macroF1 } = scoreClasses(confusion);

  const events: EventScore[] = [];
  const gtMerged = mergeSegments(gt);
  const predMerged = mergeSegments(pred);
  for (const cls of ["AWAY", "PHONE", "SLEEP"] as const) {
    const gtEvents = gtMerged.filter((s) => s.label === cls);
    const predEvents = predMerged.filter((s) => s.label === cls);
    const latencies: number[] = [];
    for (const event of gtEvents) {
      const hit = predEvents.find(
        (p) => p.endMs > event.startMs && p.startMs < event.endMs + options.eventGraceMs,
      );
      if (hit !== undefined) {
        latencies.push(Math.max(0, hit.startMs - event.startMs) / 1000);
      }
    }
    const falseAlarms = predEvents.filter(
      (p) =>
        !gtEvents.some(
          (event) => p.endMs > event.startMs && p.startMs < event.endMs + options.eventGraceMs,
        ) &&
        // 라벨이 없는 시간에만 걸친 예측은 오경보로 세지 않는다.
        gt.some((segment) => p.endMs > segment.startMs && p.startMs < segment.endMs),
    ).length;
    events.push({
      label: cls,
      gtEvents: gtEvents.length,
      detected: latencies.length,
      meanLatencySec:
        latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null,
      maxLatencySec: latencies.length > 0 ? Math.max(...latencies) : null,
      falseAlarms,
    });
  }

  return {
    scoredSec: scoredMs / 1000,
    accuracy: ratio(correctMs, scoredMs),
    confusionSec: confusion,
    perClass,
    macroF1,
    gtFocusSec: gtFocusMs / 1000,
    predFocusSec: predFocusMs / 1000,
    overCountSec: overMs / 1000,
    underCountSec: underMs / 1000,
    events,
  };
}

/** 여러 클립을 합친 지표. 혼동 행렬·시간은 더하고, 비율은 합친 값에서 다시 낸다. */
export function aggregateMetrics(list: readonly ClipMetrics[]): ClipMetrics | null {
  if (list.length === 0) {
    return null;
  }
  const confusion = emptyConfusion();
  let scored = 0;
  let correct = 0;
  let gtFocus = 0;
  let predFocus = 0;
  let over = 0;
  let under = 0;
  for (const m of list) {
    scored += m.scoredSec;
    gtFocus += m.gtFocusSec;
    predFocus += m.predFocusSec;
    over += m.overCountSec;
    under += m.underCountSec;
    for (const gt of BENCH_CLASSES) {
      for (const p of BENCH_CLASSES) {
        confusion[gt][p] += m.confusionSec[gt][p];
      }
      correct += m.confusionSec[gt][gt];
    }
  }
  const { perClass, macroF1 } = scoreClasses(confusion);
  const events: EventScore[] = (["AWAY", "PHONE", "SLEEP"] as const).map((label) => {
    const rows = list
      .map((m) => m.events.find((e) => e.label === label))
      .filter((e) => e !== undefined);
    const detected = rows.reduce((a, e) => a + e.detected, 0);
    const latencySum = rows.reduce((a, e) => a + (e.meanLatencySec ?? 0) * e.detected, 0);
    const maxes = rows.map((e) => e.maxLatencySec).filter((v): v is number => v !== null);
    return {
      label,
      gtEvents: rows.reduce((a, e) => a + e.gtEvents, 0),
      detected,
      meanLatencySec: detected > 0 ? latencySum / detected : null,
      maxLatencySec: maxes.length > 0 ? Math.max(...maxes) : null,
      falseAlarms: rows.reduce((a, e) => a + e.falseAlarms, 0),
    };
  });
  return {
    scoredSec: scored,
    accuracy: ratio(correct, scored),
    confusionSec: confusion,
    perClass,
    macroF1,
    gtFocusSec: gtFocus,
    predFocusSec: predFocus,
    overCountSec: over,
    underCountSec: under,
    events,
  };
}
