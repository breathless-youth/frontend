import type {
  DetectionSource,
  DetectionParams,
  TriggerSignals,
} from "@/features/study-session/detection";
import {
  createDetectionState,
  DEFAULT_DETECTION_PARAMS,
  NO_TRIGGER_SIGNALS,
  stepDetection,
} from "@/features/study-session/detection";
import { createVisionFocusDetector } from "@/features/study-session/adapters/focusDetector";
import type { VisionFocusDetector } from "@/features/study-session/adapters/focusDetector";
import type { SessionState } from "@/features/study-session/sessionState";
import { distractionState, FOCUS_STATE } from "@/features/study-session/sessionState";
import type { SessionTotals } from "@/features/study-session/sessionTimeline";
import {
  closeSessionTimeline,
  computeSessionTotals,
  createSessionTimeline,
  toStatusEvents,
  transition,
} from "@/features/study-session/sessionTimeline";
import type {
  PersonPresenceRule,
  PhoneUsageRule,
} from "@/features/study-session/vision/detectionRules";
import {
  maxScoreFor,
  PERSON_LABEL,
  PHONE_LABEL,
} from "@/features/study-session/vision/detectionRules";
import type {
  FrameDiagnostics,
  VisionDiagnostics,
} from "@/features/study-session/vision/diagnostics";
import type { EyeCalibration } from "@/features/study-session/vision/eyeCalibration";
import { createObjectDetector } from "@/features/study-session/vision/objectDetector";
import type { ModelVariant } from "@/features/study-session/vision/visionConfig";
import { FRAME_INTERVAL_MS, SCORE_THRESHOLDS } from "@/features/study-session/vision/visionConfig";

import type { BenchClass } from "./labels";
import type { PredSegment } from "./metrics";
import type { LoopMode } from "./steppedFrameLoop";
import { setLoopMode, takeManualLoop } from "./steppedFrameLoop";

/**
 * 영상 한 개를 세션 하나로 돌린다.
 *
 * 검출기(`createVisionFocusDetector`)·유지시간 판정(`stepDetection`)·세션 타임라인(`transition`,
 * `computeSessionTotals`)은 전부 프로덕션 모듈을 그대로 부른다. 여기서 다시 구현하는 것은
 * `useStudyRoomSession`이 하는 배선 두 줄뿐이다.
 *
 * 1. 신호를 받으면 그 시각으로 `stepDetection`.
 * 2. `tickMs`마다 `stepDetection` 후 `active`로 `transition`.
 *
 * 시각은 전부 **영상 시각(ms)** 이다. 벽시계가 아니므로 같은 영상·같은 설정이면 결과가 같다.
 */

export interface BenchSettings {
  readonly mode: LoopMode;
  readonly modelVariant: ModelVariant;
  readonly sleepDetection: boolean;
  readonly personThreshold: number;
  readonly phoneThreshold: number;
  readonly holds: DetectionParams;
  /** 수동 모드에서 신호가 프레임 시각보다 이만큼 늦게 도착했다고 본다(실기기 추론 시간). */
  readonly inferenceLatencyMs: number;
  /** `useStudyRoomSession`의 상태 반영 주기. 프로덕션 기본 200ms. */
  readonly tickMs: number;
}

export const DEFAULT_SETTINGS: BenchSettings = {
  mode: "manual",
  modelVariant: "int8",
  sleepDetection: true,
  personThreshold: SCORE_THRESHOLDS.person,
  phoneThreshold: SCORE_THRESHOLDS.phone,
  holds: DEFAULT_DETECTION_PARAMS,
  inferenceLatencyMs: 300,
  tickMs: 200,
};

export interface FrameRecord {
  readonly t: number;
  readonly personPresent: boolean;
  readonly personScore: number;
  readonly phoneScore: number;
  readonly phoneSignal: boolean;
  readonly durationMs: number;
  readonly sleepEyes: boolean | null;
  readonly sleepDrowsy: boolean | null;
  readonly eyeThreshold: number | null;
  readonly eyeClosedRatio: number | null;
  /** 이 프레임에 얼굴 추론이 돌았는가(2프레임에 한 번). */
  readonly faceRan: boolean;
  readonly facePresent: boolean | null;
  /** 양쪽 눈 감김 점수 중 작은 쪽. 판정이 쓰는 값이다. */
  readonly eyeClosure: number | null;
  readonly faceSkip: string | null;
  readonly headPitchDeg: number | null;
}

export interface SignalEvent {
  readonly t: number;
  readonly source: DetectionSource;
  readonly active: boolean;
}

export interface ClipRun {
  readonly name: string;
  readonly durationMs: number;
  readonly frames: FrameRecord[];
  readonly signals: SignalEvent[];
  readonly segments: PredSegment[];
  readonly totals: SessionTotals;
  /** 서버로 나갈 상태 이벤트 수(1초 미만 구간은 프로덕션처럼 빠진다). */
  readonly statusEventCount: number;
  readonly runtime: string | null;
  readonly objectStatus: string;
  readonly faceStatus: string;
  readonly calibration: EyeCalibration | null;
  readonly wallMs: number;
  readonly warnings: string[];
}

export interface RunProgress {
  readonly t: number;
  readonly durationMs: number;
  readonly state: SessionState;
  readonly signals: TriggerSignals;
  readonly phase: "loading" | "running";
}

function trigger(state: SessionState): BenchClass {
  if (state.kind === "DISTRACTION") {
    // DEVICE는 가속도 센서 출처라 영상 벤치에서는 나오지 않는다.
    return state.trigger === "DEVICE" ? "PHONE" : state.trigger;
  }
  return "FOCUS";
}

function waitEvent(
  target: HTMLVideoElement,
  event: "loadeddata" | "seeked" | "ended",
  timeoutMs = 15_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`영상 ${event} 대기 시간 초과`));
    }, timeoutMs);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`영상 ${event} 실패 — 브라우저가 이 코덱을 못 읽을 수 있습니다`));
    };
    function cleanup() {
      clearTimeout(timer);
      target.removeEventListener(event, onOk);
      target.removeEventListener("error", onError);
    }
    target.addEventListener(event, onOk, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

async function seek(video: HTMLVideoElement, seconds: number): Promise<void> {
  if (Math.abs(video.currentTime - seconds) < 1e-4 && video.readyState >= 2) {
    return;
  }
  const done = waitEvent(video, "seeked");
  video.currentTime = seconds;
  await done;
}

async function waitReady(detector: VisionFocusDetector, sleep: boolean, signal?: AbortSignal) {
  const started = performance.now();
  for (;;) {
    if (signal?.aborted) {
      throw new DOMException("중단됨", "AbortError");
    }
    const objectDone = detector.status === "ready" || detector.status === "unavailable";
    const faceDone =
      !sleep ||
      detector.status === "unavailable" ||
      detector.faceStatus === "ready" ||
      detector.faceStatus === "unavailable";
    if (objectDone && faceDone) {
      return;
    }
    if (performance.now() - started > 90_000) {
      throw new Error("모델 준비 시간 초과(90초)");
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

function rulesFor(settings: BenchSettings): {
  presenceRule?: PersonPresenceRule;
  phoneRule?: PhoneUsageRule;
} {
  // 기본값이면 프로덕션 규칙 객체를 그대로 쓰도록 아무것도 넘기지 않는다.
  return {
    presenceRule:
      settings.personThreshold === SCORE_THRESHOLDS.person
        ? undefined
        : (frame) => maxScoreFor(frame.detections, PERSON_LABEL) >= settings.personThreshold,
    phoneRule:
      settings.phoneThreshold === SCORE_THRESHOLDS.phone
        ? undefined
        : {
            evaluate: (frame) =>
              maxScoreFor(frame.detections, PHONE_LABEL) >= settings.phoneThreshold,
          },
  };
}

function toRecord(t: number, d: FrameDiagnostics): FrameRecord {
  const eye = d.face?.eye ?? null;
  const blinkL = eye?.eyeBlinkLeft;
  const blinkR = eye?.eyeBlinkRight;
  return {
    t,
    personPresent: d.personPresent,
    personScore: d.topScores[PERSON_LABEL] ?? 0,
    phoneScore: d.topScores[PHONE_LABEL] ?? 0,
    phoneSignal: d.phoneSignal,
    durationMs: d.durationMs,
    sleepEyes: d.sleepEyesSignal ?? null,
    sleepDrowsy: d.sleepDrowsySignal ?? null,
    eyeThreshold: d.eyeThreshold ?? null,
    eyeClosedRatio: d.eyeClosedRatio ?? null,
    faceRan: d.face !== undefined && d.face !== null,
    facePresent: d.face?.present ?? null,
    eyeClosure: blinkL !== undefined && blinkR !== undefined ? Math.min(blinkL, blinkR) : null,
    faceSkip: d.face?.skipReason ?? null,
    headPitchDeg: d.face?.headPitchDeg ?? null,
  };
}

/** 영상 시각을 계속 단조 증가시키는 MediaPipe 타임스탬프 기준점. 클립이 바뀌어도 되돌아가지 않는다. */
let timestampBase = 0;

interface SessionSim {
  onSignal(event: SignalEvent): void;
  advanceTo(t: number): void;
  finish(durationMs: number): {
    segments: PredSegment[];
    totals: SessionTotals;
    statusEventCount: number;
  };
  readonly state: SessionState;
  readonly signals: TriggerSignals;
}

function createSessionSim(settings: BenchSettings): SessionSim {
  let detection = createDetectionState(0);
  let signals: TriggerSignals = { ...NO_TRIGGER_SIGNALS };
  let timeline = createSessionTimeline(0);
  let state: SessionState = FOCUS_STATE;
  let nextTick = settings.tickMs;
  const pending: SignalEvent[] = [];

  function applySignal(event: SignalEvent) {
    signals = { ...signals, [event.source]: event.active };
    detection = stepDetection(detection, signals, event.t, settings.holds);
  }

  function tick(at: number) {
    detection = stepDetection(detection, signals, at, settings.holds);
    const active = detection.active;
    state = active === null ? FOCUS_STATE : distractionState(active);
    timeline = transition(timeline, state, at);
  }

  return {
    get state() {
      return state;
    },
    get signals() {
      return signals;
    },
    onSignal(event) {
      pending.push(event);
      pending.sort((a, b) => a.t - b.t);
    },
    advanceTo(t) {
      for (;;) {
        const event = pending[0];
        const eventT = event?.t ?? Number.POSITIVE_INFINITY;
        const next = Math.min(eventT, nextTick);
        if (next > t) {
          return;
        }
        if (event !== undefined && eventT <= nextTick) {
          pending.shift();
          applySignal(event);
        } else {
          tick(nextTick);
          nextTick += settings.tickMs;
        }
      }
    },
    finish(durationMs) {
      this.advanceTo(durationMs);
      const closed = closeSessionTimeline(timeline, durationMs);
      const segments: PredSegment[] = closed.segments
        .map((segment) => ({
          startMs: segment.startedAtMs,
          endMs: segment.endedAtMs ?? durationMs,
          label: trigger(segment.state),
        }))
        .filter((segment) => segment.endMs > segment.startMs);
      return {
        segments,
        totals: computeSessionTotals(closed, durationMs),
        statusEventCount: toStatusEvents(closed, durationMs).length,
      };
    },
  };
}

export interface RunClipOptions {
  readonly name: string;
  readonly video: HTMLVideoElement;
  readonly settings: BenchSettings;
  readonly onProgress?: (progress: RunProgress) => void;
  readonly signal?: AbortSignal;
}

export async function runClip(options: RunClipOptions): Promise<ClipRun> {
  const { name, video, settings, onProgress, signal } = options;
  const started = performance.now();
  const warnings: string[] = [];
  video.muted = true;
  video.playsInline = true;
  video.pause();
  if (video.readyState < 2) {
    await waitEvent(video, "loadeddata");
  }
  const durationMs = Math.floor((Number.isFinite(video.duration) ? video.duration : 0) * 1000);
  if (durationMs <= 0) {
    throw new Error("영상 길이를 읽지 못했습니다");
  }
  if (durationMs < 60_000 && settings.sleepDetection) {
    warnings.push(
      "1분 미만 영상 — 눈 기준값 보정(얼굴 15표본 ≈ 30초)과 졸음 비율 창(22표본 ≈ 44초)이 다 차지 않아 졸음 판정이 거의 나오지 않습니다.",
    );
  }

  const frames: FrameRecord[] = [];
  const signals: SignalEvent[] = [];
  let currentT = 0;
  const sim = createSessionSim(settings);

  const diagnostics: VisionDiagnostics = {
    detectorReady() {},
    detectorUnavailable(reason) {
      warnings.push(`객체 검출기 사용 불가: ${reason}`);
    },
    frame(d) {
      frames.push(toRecord(settings.mode === "manual" ? currentT : video.currentTime * 1000, d));
    },
    faceReady() {},
    faceUnavailable(reason) {
      warnings.push(`얼굴 모델 사용 불가: ${reason}`);
    },
    transition() {},
    cameraStream() {},
  };

  const makeDetector = () =>
    createVisionFocusDetector({
      video: () => video,
      detector: createObjectDetector({ modelVariant: settings.modelVariant }),
      sleepDetection: settings.sleepDetection,
      diagnostics,
      ...(settings.mode === "manual" ? { nowMs: () => timestampBase + currentT } : {}),
      ...rulesFor(settings),
    });

  setLoopMode(settings.mode);
  await seek(video, 0);
  const detector = makeDetector();
  const report = (phase: RunProgress["phase"]) =>
    onProgress?.({ t: currentT, durationMs, state: sim.state, signals: sim.signals, phase });

  try {
    if (settings.mode === "manual") {
      const loop = takeManualLoop();
      detector.subscribe((s) => {
        const event = {
          t: currentT + Math.max(0, Math.min(settings.inferenceLatencyMs, FRAME_INTERVAL_MS - 1)),
          source: s.source,
          active: s.active,
        };
        signals.push(event);
        sim.onSignal(event);
      });
      detector.start();
      report("loading");
      // 첫 프레임이 모델 로딩을 건다. 로딩 중 프레임은 판정이 없으므로(계약 2) 시각을 나아가지 않고 기다린다.
      await loop.step();
      await waitReady(detector, settings.sleepDetection, signal);

      for (let t = 0; t < durationMs; t += FRAME_INTERVAL_MS) {
        if (signal?.aborted) {
          throw new DOMException("중단됨", "AbortError");
        }
        currentT = t;
        await seek(video, t / 1000);
        await loop.step();
        sim.advanceTo(Math.min(t + FRAME_INTERVAL_MS, durationMs) - 1);
        report("running");
      }
      timestampBase += durationMs + 60_000;
    } else {
      // 실시간: 프로덕션 루프 그대로. 모델은 별도 검출기로 미리 데워 두고(캐시), 세션 검출기는 재생과 함께 시작한다.
      detector.subscribe((s) => {
        const event = { t: video.currentTime * 1000, source: s.source, active: s.active };
        signals.push(event);
        sim.onSignal(event);
      });
      report("loading");
      await warmUp(settings, video, signal);
      detector.start();
      const ended = waitEvent(video, "ended", durationMs + 60_000);
      const timer = setInterval(() => {
        currentT = video.currentTime * 1000;
        sim.advanceTo(currentT);
        report("running");
      }, settings.tickMs);
      const onAbort = () => video.pause();
      signal?.addEventListener("abort", onAbort);
      try {
        await video.play();
        await ended;
      } finally {
        clearInterval(timer);
        signal?.removeEventListener("abort", onAbort);
      }
      if (signal?.aborted) {
        throw new DOMException("중단됨", "AbortError");
      }
    }

    const result = sim.finish(durationMs);
    return {
      name,
      durationMs,
      frames,
      signals,
      ...result,
      runtime: detector.runtime,
      objectStatus: detector.status,
      faceStatus: detector.faceStatus,
      calibration: detector.eyeCalibration,
      wallMs: performance.now() - started,
      warnings,
    };
  } finally {
    detector.close();
    setLoopMode("manual");
  }
}

async function warmUp(settings: BenchSettings, video: HTMLVideoElement, signal?: AbortSignal) {
  setLoopMode("manual");
  const warm = createVisionFocusDetector({
    video: () => video,
    detector: createObjectDetector({ modelVariant: settings.modelVariant }),
    sleepDetection: settings.sleepDetection,
    nowMs: () => timestampBase,
  });
  const loop = takeManualLoop();
  try {
    warm.start();
    await loop.step();
    await waitReady(warm, settings.sleepDetection, signal);
  } finally {
    warm.close();
    timestampBase += 1000;
    setLoopMode("realtime");
  }
}

export function frameCount(durationMs: number): number {
  return Math.ceil(durationMs / FRAME_INTERVAL_MS);
}

export type { DetectionParams };
