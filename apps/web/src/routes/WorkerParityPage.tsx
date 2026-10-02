import { useEffect, useRef, useState } from "react";

import {
  evaluateFrame,
  PERSON_LABEL,
  PHONE_LABEL,
  topScoresByLabel,
} from "@/features/study-session/vision/detectionRules";
import {
  createObjectDetector,
  type MediapipeVisionRuntime,
  type VisionObjectDetector,
} from "@/features/study-session/vision/objectDetector";
import {
  DEFAULT_MODEL_VARIANT,
  FRAME_INTERVAL_MS,
} from "@/features/study-session/vision/visionConfig";

interface WorkerParityResult {
  readonly frames: number;
  readonly personAgreement: number;
  readonly phoneAgreement: number;
  readonly maxScoreDiff: { readonly person: number; readonly phone: number };
  readonly userAgent: string;
}

declare global {
  interface Window {
    /** 측정 빌드에서만 채운다. 하네스 `scripts/perf/measure-worker.mjs`가 읽는다. */
    __workerParity?: WorkerParityResult;
  }
}

const FRAME_STEP_S = 0.5;
const SAMPLE_URL = "/perf-media/sample.webm";

function once(target: HTMLVideoElement, event: "loadeddata" | "seeked"): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = () => reject(new Error(`video ${event} 실패`));
    target.addEventListener("error", onError, { once: true });
    target.addEventListener(
      event,
      () => {
        target.removeEventListener("error", onError);
        resolve();
      },
      { once: true },
    );
  });
}

async function openDetector(
  name: string,
  loadRuntime: () => Promise<MediapipeVisionRuntime>,
): Promise<VisionObjectDetector> {
  const detector = createObjectDetector({ loadRuntime, modelVariant: DEFAULT_MODEL_VARIANT });
  if ((await detector.load()) !== "ready") {
    throw new Error(`${name} 검출기를 준비하지 못했다`);
  }
  return detector;
}

async function run(video: HTMLVideoElement, onStatus: (text: string) => void) {
  onStatus("영상 받는 중");
  // 서버 주소로 재생하면 Range를 지원하지 않는 서버에서 위치 이동이 오류 없이 무시된다.
  // 그래서 blob으로 받는다.
  const blob = await (await fetch(SAMPLE_URL)).blob();
  const src = URL.createObjectURL(blob);
  let worker: VisionObjectDetector | null = null;
  let main: VisionObjectDetector | null = null;
  // 도중에 실패해도 검출기 둘과 blob을 놓는다.
  // 놓지 않으면 실패한 실행의 워커와 모델이 탭에 남는다.
  try {
    video.src = src;
    await once(video, "loadeddata");

    onStatus("검출기 준비 중");
    // 폴백 없이 각 경로를 따로 연다.
    // 워커가 안 되면 여기서 실패해야 비교가 의미 있다.
    worker = await openDetector("워커", async () =>
      (await import("@/features/study-session/vision/workerRuntime")).createWorkerRuntime(),
    );
    main = await openDetector("메인 스레드", async () =>
      (await import("@/features/study-session/vision/mediapipeModule")).createMediapipeRuntime(),
    );
    if (worker.runtime !== "worker" || main.runtime !== "main") {
      throw new Error(`런타임이 다르다: ${worker.runtime} / ${main.runtime}`);
    }

    const frameSize = { width: video.videoWidth, height: video.videoHeight };
    const count = Math.floor(video.duration / FRAME_STEP_S) + 1;
    let personSame = 0;
    let phoneSame = 0;
    let personDiff = 0;
    let phoneDiff = 0;
    let previousTime = -1;
    for (let index = 0; index < count; index += 1) {
      // 대기를 먼저 건다.
      // 위치를 바꾼 뒤에 걸면 빠르게 끝난 seeked를 놓칠 수 있다.
      const seeked = once(video, "seeked");
      video.currentTime = Math.min(index * FRAME_STEP_S, video.duration);
      await seeked;
      if (video.currentTime === previousTime) {
        throw new Error(`영상 위치가 움직이지 않았다(${previousTime}s)`);
      }
      previousTime = video.currentTime;
      const atMs = (index + 1) * FRAME_INTERVAL_MS;
      const [a, b] = [await worker.detect(video, atMs), await main.detect(video, atMs)];
      if (a === null || b === null) {
        throw new Error(`${index}번 프레임 추론 실패`);
      }
      const signalsA = evaluateFrame({ detections: a.detections, previous: null, frameSize, atMs });
      const signalsB = evaluateFrame({ detections: b.detections, previous: null, frameSize, atMs });
      const scoresA = topScoresByLabel(a.detections);
      const scoresB = topScoresByLabel(b.detections);
      personSame += signalsA.personPresent === signalsB.personPresent ? 1 : 0;
      phoneSame += signalsA.phoneInUse === signalsB.phoneInUse ? 1 : 0;
      personDiff = Math.max(
        personDiff,
        Math.abs((scoresA[PERSON_LABEL] ?? 0) - (scoresB[PERSON_LABEL] ?? 0)),
      );
      phoneDiff = Math.max(
        phoneDiff,
        Math.abs((scoresA[PHONE_LABEL] ?? 0) - (scoresB[PHONE_LABEL] ?? 0)),
      );
      onStatus(`${index + 1}/${count} 프레임`);
    }
    return {
      frames: count,
      personAgreement: personSame / count,
      phoneAgreement: phoneSame / count,
      maxScoreDiff: { person: personDiff, phone: phoneDiff },
      userAgent: navigator.userAgent,
    };
  } finally {
    worker?.close();
    main?.close();
    URL.revokeObjectURL(src);
  }
}

/**
 * 워커와 메인 스레드의 판정 일치 확인 페이지
 *
 * `VITE_PERF_PANEL=1` 측정 빌드 전용이다.
 * 녹화본을 0.5초 간격으로 멈춰 같은 프레임을 워커 경로와 메인 스레드 경로에 넣고 판정이 같은지 본다.
 * 결과에는 점수 차와 일치율만 있고 박스 좌표는 없다.
 * 절차는 `docs/runbooks/vision-worker-measurement.md`에 있다.
 */
export function WorkerParityPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const started = useRef(false);
  const [status, setStatus] = useState("시작 전");

  useEffect(() => {
    const video = videoRef.current;
    if (video === null || started.current) {
      return;
    }
    started.current = true;
    run(video, setStatus)
      .then((result) => {
        window.__workerParity = result;
        setStatus(
          `완료: 사람 ${(result.personAgreement * 100).toFixed(1)}%, 휴대폰 ${(result.phoneAgreement * 100).toFixed(1)}% (${result.frames}프레임)`,
        );
      })
      .catch((error: unknown) => {
        setStatus(`실패: ${error instanceof Error ? error.message : String(error)}`);
      });
  }, []);

  return (
    <main className="space-y-3 p-4 font-mono text-xs">
      <p data-parity-status="">{status}</p>
      <video ref={videoRef} muted playsInline preload="auto" className="w-60" />
    </main>
  );
}
