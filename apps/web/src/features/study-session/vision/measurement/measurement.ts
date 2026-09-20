import { DEFAULT_DETECTION_PARAMS } from "../../detection";
import type { SessionState } from "../../sessionState";
import type { Delegate } from "../visionConfig";
import type { FrameDiagnostics, VisionDiagnostics } from "../diagnostics";
import type { ThermalTimerState } from "./runner";
import type { MeasurementScenario } from "./scenarios";
import {
  FACE_BASELINE_MIN_RATIO,
  FACE_BASELINE_SAMPLES,
  FACE_FRAME_DIVISOR,
  FACE_LOST_ENABLED,
  FACE_SMOOTHING_SAMPLES,
  FRAME_INTERVAL_MS,
  SCORE_THRESHOLDS,
  SLEEP_THRESHOLDS,
} from "../visionConfig";

/**
 * 실기기 측정용 계측 — BY-704의 측정이 끝나면 통째로 지운다.
 *
 * 계측을 감지 코드 곳곳에 심으면 지울 때 손자국이 흩어진다. 그래서 진단 인터페이스를 감싸는
 * 껍데기 하나로 모았다. 지나가는 값을 여기서 다 볼 수 있고, 지울 때는 감싸는 줄 하나만 푼다.
 *
 * ## 지울 때 되돌릴 것
 *
 * 1. `vision/measurement/` 폴더를 통째로 지운다. 계측·시나리오·진행·패널·배선·플래그·테스트가
 *    전부 이 안에 있다(`?rehearsal=1`도 이 폴더 안에서만 읽는다).
 * 2. `vision/frameLoop.ts`의 `FrameLoopOptions.onDrop`과 `fire()`의 `onDrop?.()` 호출을 지운다.
 * 3. `vision/diagnostics.ts`의 `VisionDiagnostics.frameDropped`와 두 구현을 지운다.
 * 4. `adapters/focusDetector.ts`에서 이 폴더의 import를 지우고 셋을 되돌린다 — 기본 진단을
 *    `visionDiagnostics`로, `baseline` 기본값을 `{ samples: FACE_BASELINE_SAMPLES, minRatio:
 *    FACE_BASELINE_MIN_RATIO }`로(두 상수의 `../vision/visionConfig` import도 함께 되살린다),
 *    `createFrameLoop`의 `onDrop` 인자 삭제.
 * 5. `adapters/mediaStreamCamera.ts`의 `measurementDiagnostics.cameraStream`을
 *    `visionDiagnostics`로 되돌리고 import도 바꾼다.
 * 6. `useStudyRoomSession.ts`에서 셋을 지운다 — `./vision/measurement` import,
 *    `applyState`의 `measurementDiagnostics.transition(...)` 호출, 세션 시작 이펙트의
 *    `measurementDiagnostics.sessionStarted()` 호출.
 * 7. `__tests__/useStudyRoomSession.measurement.test.tsx`를 지운다.
 * 8. `adapters/__tests__/visionFocusDetector.test.ts`에서 가짜 진단의 `frameDropped` 항목과
 *    "앞 프레임이 안 끝난 채 지나간 틱을 진단에 알린다" 케이스를 지운다.
 * 9. `adapters/__tests__/mediaStreamCamera.test.ts`의 "사전 점검이 읽을 수 있게 계측
 *    인스턴스에도 실린다" 케이스와 `../../vision/measurement` import를 지운다.
 * 10. `vision/__tests__/frameLoop.test.ts`의 "앞 프레임이 안 끝나 건너뛴 틱을 알린다",
 *    "정상 속도면 알리지 않는다", "추론이 떠 있는 채로 stop 후 start해도 버린 틱으로 세지
 *    않는다"와 `vision/__tests__/diagnostics.test.ts`의 "버린 틱을 이벤트로 남긴다"를 지운다.
 * 11. `docs/runbooks/sleep-detection-measurement.md`를 지운다.
 *
 * URL 표시 `?rehearsal=1`은 이 폴더 안에서만 읽으므로 폴더와 함께 사라진다.
 */

/**
 * 세션 상태를 로그 한 칸에 들어가는 문자열로 줄인다.
 *
 * `sessionState.ts`가 아니라 여기 두는 이유는 수명이다. 측정이 끝나면 이 표현도 같이 사라져야
 * 하는데, 상태 모듈에 두면 지울 때 그 파일을 다시 손대야 한다.
 */
export function stateLabel(state: SessionState): string {
  switch (state.kind) {
    case "FOCUS":
      return "FOCUS";
    case "DISTRACTION":
      return `DISTRACTION:${state.trigger}`;
    case "PAUSE":
      return `PAUSE:${state.trigger}`;
  }
}

/** 한 구간이 모으는 것. 구간은 `mark()`로 갈린다. */
interface Segment {
  name: string | null;
  /** 이 구간이 무엇을 재려던 것인지. 시나리오가 연 구간에만 있다. */
  scenario: { id: string; name: string; expected: string } | null;
  /** 구간이 열린 벽시계 시각. 전이의 상대 초를 여기서 잰다. */
  openedAtMs: number;
  /** 구간 시작 시점의 세션 상태. 전이 목록을 읽는 출발점이다. */
  entryLabel: string;
  /** 이 구간에서 일어난 전이 전부. 거르지 않는다 — 일시정지도 그대로 남는다. */
  transitions: { from: string; to: string; atSec: number }[];
  frames: number;
  dropped: number;
  objectMs: number[];
  faceMs: number[];
  eyeClosure: number[];
  personScore: number[];
  faceRan: number;
  facePresent: number;
  skipped: Record<string, number>;
  sleepEyes: number;
  sleepFace: number;
  baseline: number;
}

/** 사전 점검 한 줄에 들어가는 것. 16분을 잘못된 설정으로 날리지 않게 하는 것이 목적이다. */
export interface Preflight {
  readonly detector: "대기" | "ready" | "unavailable";
  readonly face: "대기" | "ready" | "unavailable";
  /** 실제로 열린 카메라 해상도. 화상이 아니라 설정값이라 남겨도 된다. */
  readonly camera: string | null;
  readonly delegate: Delegate | null;
}

/** 패널이 1초마다 읽는 값. 덩어리를 다시 만들지 않게 작게 돌려준다. */
export interface MeasurementStats {
  readonly dropped: number;
  /** 세션 전체를 버킷으로 근사한 값. 분당 요약 줄의 정확한 p95와는 범위도 방식도 다르다. */
  readonly objectP95: number | null;
  readonly faceP95: number | null;
  /** 히스토그램 상한(2초)을 넘은 표본 수. 화면 값이 상한에 붙어 안 움직이는 것과 구분한다. */
  readonly overLimit: number;
  /** 지금 구간에서 일어난 전이 수. 패널은 이것만 보여주고 판단하지 않는다. */
  readonly segmentTransitions: number;
}

export interface MeasurementOptions {
  /**
   * 꺼져 있으면 아무것도 모으지 않고 넘기기만 한다. 측정 대상이 발열인데 계측이 부하를 더하면
   * 측정 자체가 무의미해진다.
   */
  readonly enabled?: boolean;
  /** 경과 시간을 재는 시계. 테스트가 60초를 실제로 기다리지 않게 열어 둔다. */
  readonly now?: () => number;
  /** 분당 요약 한 줄을 받는 곳. 실제 경로는 배선이 콘솔을 주입한다. */
  readonly onLine?: (line: string) => void;
  /** 리허설로 돈 세션인가. 덩어리를 받은 사람이 본 측정과 구분할 유일한 표시다. */
  readonly rehearsal?: boolean;
  /** 감지기에 실제로 들어간 엎드림 기준선. 설정 스냅샷이 이 값을 싣는다. */
  readonly baseline?: { readonly samples: number; readonly minRatio: number };
  /** 감지기에 실제로 들어간 엎드림 판정 여부. 기본값은 `visionConfig`의 상수다. */
  readonly faceLostEnabled?: boolean;
  /**
   * 세션이 실제로 시작됐다는 신호. 패널은 이때 붙는다.
   *
   * 첫 프레임이 대표적이지만 그것만으로는 모자란다. 객체 검출기가 감지 불가로 확정되면
   * 프레임 호출 자체가 오지 않아, **사전 점검이 알리려던 바로 그 실패에서 패널이 안 뜬다.**
   * 그래서 모델 실패도 같은 신호로 본다. 여러 번 와도 한 번만 부른다.
   */
  readonly onSessionSignal?: () => void;
}

export interface Measurement extends VisionDiagnostics {
  /**
   * 지금까지의 구간을 닫고 새 구간을 연다.
   *
   * 시나리오를 함께 넘기면 번호·이름·기대 문장이 그 구간에 붙는다. 기대 문장은 **사람이 읽는
   * 것이고 계산에 쓰지 않는다** — 덩어리를 받는 사람이 그 구간의 의도를 알게 하는 표시다.
   */
  mark(name: string, scenario?: MeasurementScenario): void;
  /** 세션 전체 요약. 콘솔에서 복사할 수 있게 **문자열**로 돌려준다. */
  dump(): string;
  /** 새 세션이 시작됐다. 구간 시작 상태를 집중으로 되돌린다. */
  sessionStarted(): void;
  /** 발열 회차의 현재 요약으로 갈아 끼운다. 되돌리기가 있으므로 누적이 아니라 대체다. */
  setThermal(state: ThermalTimerState): void;
  preflight(): Preflight;
  stats(): MeasurementStats;
}

/**
 * 추론 시간 히스토그램.
 *
 * 진행 통계는 1초마다 읽히는데, 그때마다 표본 수천 개를 모아 정렬하면 **하필 그 회차의 CPU를
 * 재는 중에** 계측이 부하를 더한다. 버킷 카운트는 표본당 O(1)이고 읽을 때는 버킷 수만 훑는다.
 * 덩어리의 백분위는 정확한 표본으로 따로 내므로 이 근사는 화면용이다.
 */
const BUCKET_MS = 20;
const BUCKET_COUNT = 101;

function createHistogram() {
  const buckets = new Uint32Array(BUCKET_COUNT);
  let count = 0;
  let over = 0;
  return {
    add(value: number): void {
      const raw = Math.floor(value / BUCKET_MS);
      if (raw >= BUCKET_COUNT) {
        // 상한을 넘은 표본은 마지막 버킷에 담기므로 화면 값이 거기 붙어 안 움직인다.
        // 그때 "넘은 적이 있었다"를 따로 세어 두지 않으면 발열로 추론이 길어진 것을 못 본다.
        over += 1;
      }
      const index = Math.min(BUCKET_COUNT - 1, Math.max(0, raw));
      buckets[index] = (buckets[index] ?? 0) + 1;
      count += 1;
    },
    get overLimit(): number {
      return over;
    },
    percentile(ratio: number): number | null {
      if (count === 0) {
        return null;
      }
      const target = Math.ceil(ratio * count);
      let seen = 0;
      for (let index = 0; index < BUCKET_COUNT; index += 1) {
        seen += buckets[index] ?? 0;
        if (seen >= target) {
          return index * BUCKET_MS + BUCKET_MS / 2;
        }
      }
      return null;
    },
  };
}

function createSegment(name: string | null, openedAtMs: number, entryLabel: string): Segment {
  return {
    name,
    scenario: null,
    openedAtMs,
    entryLabel,
    transitions: [],
    frames: 0,
    dropped: 0,
    objectMs: [],
    faceMs: [],
    eyeClosure: [],
    personScore: [],
    faceRan: 0,
    facePresent: 0,
    skipped: {},
    sleepEyes: 0,
    sleepFace: 0,
    baseline: 0,
  };
}

/**
 * 정렬 후 인덱스로 고른다. 보간하지 않는다 — 실제로 관측된 값이어야 임계와 직접 비교할 수 있다.
 */
function percentile(sorted: readonly number[], ratio: number, digits: number): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1));
  return round(sorted[index] ?? 0, digits);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: readonly number[], digits: number): number | null {
  if (values.length === 0) {
    return null;
  }
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, digits);
}

/** ms 통계. 발열 판단은 이 셋으로 한다 — 평균만 보면 긴 꼬리가 숨는다. */
function msStats(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    mean: mean(sorted, 1),
    p50: percentile(sorted, 0.5, 1),
    p95: percentile(sorted, 0.95, 1),
    max: sorted.length === 0 ? null : round(sorted[sorted.length - 1] ?? 0, 1),
  };
}

/**
 * 판정이 쓰는 값과 같은 방식으로 한 프레임의 눈 감김을 하나로 줄인다 — 두 눈 중 덜 감긴 쪽이다
 * (`sleepRules.smoothedEyeClosure`). 다른 방식으로 모으면 덩어리의 분포를 임계와 나란히 놓고
 * 볼 수 없다.
 */
function eyeClosureOf(diagnostics: FrameDiagnostics): number | null {
  const eye = diagnostics.face?.eye;
  if (eye === undefined || eye === null) {
    return null;
  }
  const left = eye.eyeBlinkLeft;
  const right = eye.eyeBlinkRight;
  if (left === undefined || right === undefined) {
    return null;
  }
  return Math.min(left, right);
}

/**
 * 어느 조건에서 나온 숫자인지 덩어리 안에 있어야 한다. 밖에서 맞춰 보면 틀린다.
 *
 * 기준선은 상수가 아니라 **실제로 적용된 값**을 싣는다. 리허설은 창을 줄여 돌리므로, 상수를
 * 그대로 실으면 스냅샷이 그 세션에서 일어난 일을 설명하지 못한다.
 *
 * 엎드림 판정이 꺼져 있으면 기준선 창·비율은 어떤 계산에도 쓰이지 않는다. 그 상태로 상수를
 * 그대로 실으면 마치 기준선이 살아 도는 것처럼 읽혀서, `faceLostEnabled`가 false일 때는
 * `baselineSamples`·`baselineMinRatio`를 null로 비운다.
 */
function configSnapshot(baseline: { samples: number; minRatio: number }, faceLostEnabled: boolean) {
  return {
    frameIntervalMs: FRAME_INTERVAL_MS,
    faceFrameDivisor: FACE_FRAME_DIVISOR,
    faceSmoothingSamples: FACE_SMOOTHING_SAMPLES,
    eyeClosure: SLEEP_THRESHOLDS.eyeClosure,
    faceLostEnabled,
    faceLostPersonScore: SLEEP_THRESHOLDS.faceLostPersonScore,
    personScore: SCORE_THRESHOLDS.person,
    baselineSamples: faceLostEnabled ? baseline.samples : null,
    baselineMinRatio: faceLostEnabled ? baseline.minRatio : null,
    sleepEyesEnterMs: DEFAULT_DETECTION_PARAMS.SLEEP_EYES.enterMs,
    sleepEyesExitMs: DEFAULT_DETECTION_PARAMS.SLEEP_EYES.exitMs,
    sleepFaceEnterMs: DEFAULT_DETECTION_PARAMS.SLEEP_FACE.enterMs,
    sleepFaceExitMs: DEFAULT_DETECTION_PARAMS.SLEEP_FACE.exitMs,
  };
}

function summarize(segment: Segment) {
  const eyeSorted = [...segment.eyeClosure].sort((a, b) => a - b);
  const personSorted = [...segment.personScore].sort((a, b) => a - b);
  return {
    name: segment.name,
    scenario: segment.scenario,
    entryLabel: segment.entryLabel,
    transitions: segment.transitions,
    frames: segment.frames,
    dropped: segment.dropped,
    object: msStats(segment.objectMs),
    face: {
      ran: segment.faceRan,
      presentRatio: segment.faceRan === 0 ? null : round(segment.facePresent / segment.faceRan, 3),
      skipped: segment.skipped,
      ...msStats(segment.faceMs),
    },
    eye: {
      samples: eyeSorted.length,
      p05: percentile(eyeSorted, 0.05, 3),
      p50: percentile(eyeSorted, 0.5, 3),
      p95: percentile(eyeSorted, 0.95, 3),
    },
    person: {
      mean: mean(personSorted, 3),
      p05: percentile(personSorted, 0.05, 3),
      p50: percentile(personSorted, 0.5, 3),
    },
    sleepEyes: segment.sleepEyes,
    sleepFace: segment.sleepFace,
    baseline: segment.baseline,
  };
}

/** 한 프레임의 값을 구간에 더한다. 구간과 분당 창이 같은 것을 모으므로 한 곳에 둔다. */
function record(segment: Segment, diagnostics: FrameDiagnostics): void {
  segment.frames += 1;
  segment.objectMs.push(diagnostics.durationMs);
  const person = diagnostics.topScores.person;
  if (person !== undefined) {
    segment.personScore.push(person);
  }
  if (diagnostics.sleepEyesSignal === true) {
    segment.sleepEyes += 1;
  }
  if (diagnostics.sleepFaceSignal === true) {
    segment.sleepFace += 1;
  }
  if (diagnostics.faceBaseline === true) {
    segment.baseline += 1;
  }
  const face = diagnostics.face;
  if (face === undefined || face === null) {
    return;
  }
  segment.faceRan += 1;
  segment.faceMs.push(face.durationMs);
  if (face.present) {
    segment.facePresent += 1;
  }
  if (face.skipReason !== null) {
    segment.skipped[face.skipReason] = (segment.skipped[face.skipReason] ?? 0) + 1;
  }
  const closure = eyeClosureOf(diagnostics);
  if (closure !== null) {
    segment.eyeClosure.push(closure);
  }
}

/** 분당 요약 주기. 16분 세션이 수천 줄이 되면 읽을 수 없다. */
const LINE_INTERVAL_MS = 60_000;

function numberOrDash(value: number | null): string {
  return value === null ? "-" : String(value);
}

/**
 * 요약 한 줄. 측정하는 사람이 세션 중에 눈으로 훑는 값이라 키를 짧게 둔다.
 */
function summaryLine(minute: number, segment: Segment): string {
  const object = msStats(segment.objectMs);
  const face = msStats(segment.faceMs);
  const eyeSorted = [...segment.eyeClosure].sort((a, b) => a - b);
  return [
    `min=${minute}`,
    `frames=${segment.frames}`,
    `drop=${segment.dropped}`,
    `obj=${numberOrDash(object.mean)}/${numberOrDash(object.p95)}ms`,
    `face=${numberOrDash(face.mean)}/${numberOrDash(face.p95)}ms`,
    `eye=${numberOrDash(percentile(eyeSorted, 0.5, 3))}/${numberOrDash(percentile(eyeSorted, 0.95, 3))}`,
    `facePresent=${segment.faceRan === 0 ? "-" : round(segment.facePresent / segment.faceRan, 2)}`,
    `person=${numberOrDash(mean(segment.personScore, 3))}`,
    `sleepEyes=${segment.sleepEyes}`,
    `sleepFace=${segment.sleepFace}`,
  ].join(" ");
}

/**
 * 기본 진단을 감싸 지나가는 값을 모은다. 받은 호출은 **항상** 원래 것으로 넘긴다 —
 * 껍데기가 진단을 대신하는 것이 아니라 옆에서 듣는다.
 */
export function createMeasurement(
  base: VisionDiagnostics,
  options: MeasurementOptions = {},
): Measurement {
  const {
    enabled = true,
    now = () => Date.now(),
    onLine = () => {},
    rehearsal = false,
    baseline = { samples: FACE_BASELINE_SAMPLES, minRatio: FACE_BASELINE_MIN_RATIO },
    faceLostEnabled = FACE_LOST_ENABLED,
    onSessionSignal,
  } = options;
  const segments: Segment[] = [];
  const thermalRounds: ThermalTimerState[] = [];
  /** 지금 세션 상태. 구간이 열릴 때 그 구간의 출발점으로 복사된다. */
  let currentLabel = "FOCUS";
  let preflight: Preflight = { detector: "대기", face: "대기", camera: null, delegate: null };
  let firstFrameSeen = false;
  let signalled = false;
  /** 진행 통계 전용 누적. 구간을 가로질러 합산할 때 전체를 다시 훑지 않게 한다. */
  let droppedTotal = 0;
  const objectHistogram = createHistogram();
  const faceHistogram = createHistogram();
  /** 지난 1분치만 담는 창. 누적으로 내면 구간 사이의 변화가 묻힌다. */
  let minuteWindow = createSegment(null, 0, "FOCUS");
  let minute = 0;
  /** 분당 요약의 기준 시각. **첫 프레임에 맞춘다** — 모듈 평가 시점에 맞추면 세션이 시작되자마자
   * 의미 없는 줄이 한 번 나간다. */
  let lineAtMs = 0;

  /** 패널을 붙일 신호. 첫 프레임이든 모델 실패든 먼저 오는 것 하나면 된다. */
  function signalSession(): void {
    if (signalled) {
      return;
    }
    signalled = true;
    onSessionSignal?.();
  }

  function current(): Segment {
    const last = segments[segments.length - 1];
    if (last !== undefined) {
      return last;
    }
    const created = createSegment(null, now(), currentLabel);
    segments.push(created);
    return created;
  }

  return {
    detectorReady(delegate, modelVariant) {
      base.detectorReady(delegate, modelVariant);
      if (!enabled) {
        return;
      }
      preflight = { ...preflight, detector: "ready", delegate };
    },
    detectorUnavailable(reason) {
      base.detectorUnavailable(reason);
      if (!enabled) {
        return;
      }
      preflight = { ...preflight, detector: "unavailable" };
      signalSession();
    },
    faceReady(delegate) {
      base.faceReady(delegate);
      if (!enabled) {
        return;
      }
      preflight = { ...preflight, face: "ready" };
    },
    faceUnavailable(reason) {
      base.faceUnavailable(reason);
      if (!enabled) {
        return;
      }
      preflight = { ...preflight, face: "unavailable" };
      signalSession();
    },
    cameraStream(diagnostics) {
      base.cameraStream(diagnostics);
      if (!enabled) {
        return;
      }
      // 해상도는 화상이 아니라 설정값이다. 키 이름에 가로·세로를 쓰지 않는 것은 좌표로 읽힐
      // 키를 덩어리에서 배제하는 규칙을 그대로 지키기 위해서다.
      preflight = { ...preflight, camera: `${diagnostics.width}x${diagnostics.height}` };
    },

    frame(diagnostics) {
      base.frame(diagnostics);
      if (!enabled) {
        return;
      }
      if (!firstFrameSeen) {
        firstFrameSeen = true;
        // 분당 요약의 기준을 여기서 맞춘다. 모듈 평가 시점에 맞추면 세션 첫 프레임에
        // 의미 없는 줄이 한 번 나간다.
        lineAtMs = now();
      }
      signalSession();
      record(current(), diagnostics);
      record(minuteWindow, diagnostics);
      objectHistogram.add(diagnostics.durationMs);
      if (diagnostics.face !== undefined && diagnostics.face !== null) {
        faceHistogram.add(diagnostics.face.durationMs);
      }
      const atMs = now();
      if (atMs - lineAtMs < LINE_INTERVAL_MS) {
        return;
      }
      // 타이머를 따로 두지 않는다. 프레임이 초당 두 번 오므로 그걸로 충분하고, 타이머는 지울 때
      // 손자국이 하나 더 는다.
      lineAtMs = atMs;
      minute += 1;
      onLine(summaryLine(minute, minuteWindow));
      minuteWindow = createSegment(null, atMs, currentLabel);
    },

    frameDropped() {
      base.frameDropped();
      if (!enabled) {
        return;
      }
      current().dropped += 1;
      minuteWindow.dropped += 1;
      droppedTotal += 1;
    },

    transition(from, to, atMs) {
      base.transition(from, to, atMs);
      if (!enabled) {
        return;
      }
      currentLabel = to;
      // 거르지 않는다. 일시정지도 그대로 남아야 덩어리를 읽는 사람이 구간을 오해하지 않는다.
      const segment = current();
      segment.transitions.push({
        from,
        to,
        atSec: round((atMs - segment.openedAtMs) / 1000, 1),
      });
    },

    mark(name, scenario) {
      if (!enabled) {
        return;
      }
      const meta =
        scenario === undefined
          ? null
          : { id: scenario.id, name: scenario.name, expected: scenario.expected };
      const last = segments[segments.length - 1];
      if (
        last !== undefined &&
        last.frames === 0 &&
        last.dropped === 0 &&
        last.transitions.length === 0
      ) {
        // 아직 아무것도 안 모은 구간이면 이름만 갈아 끼운다. 빈 구간이 덩어리에 남으면
        // 시나리오 수와 구간 수가 어긋나 읽는 사람이 센다.
        last.name = name;
        last.scenario = meta;
        last.openedAtMs = now();
        last.entryLabel = currentLabel;
        return;
      }
      const created = createSegment(name, now(), currentLabel);
      created.scenario = meta;
      segments.push(created);
    },

    sessionStarted() {
      if (!enabled) {
        return;
      }
      // 세션이 새로 열리면 타임라인은 집중으로 돌아가는데 전이는 발생하지 않는다. 여기서
      // 되돌리지 않으면 앞 세션의 마지막 상태가 다음 구간의 출발점으로 남는다.
      currentLabel = "FOCUS";
    },

    preflight() {
      return preflight;
    },

    setThermal(state) {
      if (!enabled) {
        return;
      }
      // 회차를 목록으로 쌓는다. 하나만 들고 있으면 두 번째 회차가 첫 회차를 덮는다.
      thermalRounds[state.round - 1] = state;
    },

    stats() {
      return {
        dropped: droppedTotal,
        objectP95: objectHistogram.percentile(0.95),
        faceP95: faceHistogram.percentile(0.95),
        overLimit: objectHistogram.overLimit + faceHistogram.overLimit,
        segmentTransitions: segments[segments.length - 1]?.transitions.length ?? 0,
      };
    },

    dump() {
      return JSON.stringify({
        rehearsal,
        preflight,
        config: configSnapshot(baseline, faceLostEnabled),
        segments: segments.map(summarize),
        thermalRounds,
      });
    },
  };
}
