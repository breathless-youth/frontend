import { reportHandled } from "@/lib/sentry";

import type {
  MediapipeHandLandmarkerHandle,
  MediapipeHandResult,
  MediapipeHandRuntime,
  VisionRuntimeKind,
} from "./mediapipePort";
import type { DetectorState } from "./objectDetector";
import type { HandPose } from "./studyEvidenceRules";
import type { Delegate } from "./visionConfig";
import {
  DELEGATE_ORDER,
  HAND_LANDMARKER_OPTIONS,
  HAND_MODEL_PATH,
  MEDIAPIPE_WASM_PATH,
} from "./visionConfig";
import { loadVisionRuntime } from "./visionRuntime";

/**
 * MediaPipe Hand Landmarker 래퍼
 *
 * 손마다 21점 중 손목·엄지 끝·검지 끝·손바닥 가운데 네 점만 넘긴다. 판정이 쓰는 것은 손이 도구나
 * 휴대폰 박스 안에 있는지와 손끝이 움직였는지뿐이다. 좌표는 어댑터 메모리에만 머물고 로그·진단으로 나가지 않는다.
 * 로드·실패 처리는 얼굴 래퍼(`faceLandmarker.ts`)와 같다.
 */

export interface HandDetectionResult {
  readonly hands: readonly HandPose[];
  readonly durationMs: number;
}

export interface VisionHandLandmarker {
  readonly state: DetectorState;
  readonly delegate: Delegate | null;
  readonly runtime: VisionRuntimeKind | null;
  load(): Promise<DetectorState>;
  detect(video: HTMLVideoElement, timestampMs: number): Promise<HandDetectionResult | null>;
  close(): void;
}

export interface CreateHandLandmarkerOptions {
  readonly loadRuntime?: () => Promise<MediapipeHandRuntime>;
  readonly delegateOrder?: readonly Delegate[];
}

const MAX_CONSECUTIVE_DETECT_FAILURES = 5;
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const PALM = 9;

export function handPosesOf(raw: MediapipeHandResult): HandPose[] {
  const poses: HandPose[] = [];
  for (const hand of raw.landmarks) {
    const wrist = hand[WRIST];
    const thumbTip = hand[THUMB_TIP];
    const indexTip = hand[INDEX_TIP];
    const palm = hand[PALM];
    if (
      wrist !== undefined &&
      thumbTip !== undefined &&
      indexTip !== undefined &&
      palm !== undefined
    ) {
      poses.push({
        wrist: { x: wrist.x, y: wrist.y },
        thumbTip: { x: thumbTip.x, y: thumbTip.y },
        indexTip: { x: indexTip.x, y: indexTip.y },
        palm: { x: palm.x, y: palm.y },
      });
    }
  }
  return poses;
}

export function createHandLandmarker(
  options: CreateHandLandmarkerOptions = {},
): VisionHandLandmarker {
  const loadRuntime = options.loadRuntime ?? loadVisionRuntime;
  const delegateOrder = options.delegateOrder ?? DELEGATE_ORDER;

  let state: DetectorState = "idle";
  let handle: MediapipeHandLandmarkerHandle | null = null;
  let delegate: Delegate | null = null;
  let consecutiveFailures = 0;
  let pending: Promise<{
    handle: MediapipeHandLandmarkerHandle;
    delegate: Delegate;
  } | null> | null = null;
  let wanted = false;

  async function open(): Promise<{
    handle: MediapipeHandLandmarkerHandle;
    delegate: Delegate;
  } | null> {
    let runtime: MediapipeHandRuntime;
    try {
      runtime = await loadRuntime();
    } catch (error: unknown) {
      reportHandled(error, "vision-hand-runtime-load");
      return null;
    }
    for (const candidate of delegateOrder) {
      if (!wanted) {
        return null;
      }
      try {
        const opened = await runtime.createHandLandmarker({
          wasmPath: MEDIAPIPE_WASM_PATH,
          modelAssetPath: HAND_MODEL_PATH,
          delegate: candidate,
          ...HAND_LANDMARKER_OPTIONS,
        });
        return { handle: opened, delegate: candidate };
      } catch (error: unknown) {
        reportHandled(error, `vision-hand-create-${candidate.toLowerCase()}`);
      }
    }
    return null;
  }

  function releaseHandle(): void {
    handle?.close();
    handle = null;
    delegate = null;
    consecutiveFailures = 0;
  }

  return {
    get state() {
      return state;
    },
    get delegate() {
      return delegate;
    },
    get runtime() {
      return handle?.runtime ?? null;
    },

    async load(): Promise<DetectorState> {
      wanted = true;
      if (state === "ready") {
        return state;
      }
      if (pending !== null) {
        await pending;
        return state;
      }
      state = "loading";
      pending = open();
      const opened = await pending;
      pending = null;
      if (opened === null) {
        if (wanted) {
          state = "unavailable";
        }
        return state;
      }
      if (!wanted) {
        opened.handle.close();
        return state;
      }
      handle = opened.handle;
      delegate = opened.delegate;
      consecutiveFailures = 0;
      state = "ready";
      return state;
    },

    async detect(video, timestampMs) {
      const current = handle;
      if (state !== "ready" || current === null) {
        return null;
      }
      const startedAt = performance.now();
      let raw: MediapipeHandResult;
      try {
        raw = await current.detect(video, timestampMs);
      } catch (error: unknown) {
        if (handle !== current) {
          return null;
        }
        consecutiveFailures += 1;
        console.warn(
          `[vision] hand detectForVideo failed (${consecutiveFailures} in a row)`,
          error,
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_DETECT_FAILURES) {
          reportHandled(error, "vision-hand-frame-loop");
          releaseHandle();
          state = "unavailable";
        }
        return null;
      }
      if (handle !== current) {
        return null;
      }
      consecutiveFailures = 0;
      return { hands: handPosesOf(raw), durationMs: performance.now() - startedAt };
    },

    close(): void {
      wanted = false;
      releaseHandle();
      state = "idle";
    },
  };
}
