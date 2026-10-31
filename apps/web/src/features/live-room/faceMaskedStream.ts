import type { FaceSpot } from "@/features/study-session/vision/faceSpot";

import type { StickerPlacement } from "./faceMaskPlan";
import { followSpot, maskModeOf } from "./faceMaskPlan";

/**
 * 얼굴을 가린 송신 영상 (2D 캔버스)
 *
 * 카메라 영상을 캔버스에 초당 15번 다시 그리고 이모지를 덮어, 그 캔버스를 상대에게 보내는 트랙으로 쓴다.
 * 내 화면에만 그리면 상대는 원본 얼굴을 받으므로 보내는 영상 자체를 바꿔야 한다.
 * 흐림은 영상을 아주 작게 줄였다가 부드럽게 키워 얼굴을 알아볼 수 없게 만든다.
 */

const SEND_HEIGHT = 360;
const SEND_FPS = 15;
/** 흐릴 때 영상을 줄이는 가로 픽셀 수. 작을수록 더 흐려진다. */
const BLUR_COLUMNS = 24;

export interface FaceMaskedStreamStats {
  readonly height: number;
  /** 최근 1초 동안 그린 프레임 수 */
  readonly fps: number;
  /** 카메라 영상을 그리는 데 걸린 메인 스레드 시간(흐림 포함, 지수 평균) */
  readonly videoMs: number;
  /** 이모지를 덮는 데 걸린 시간(지수 평균) */
  readonly stickerMs: number;
}

export interface FaceMaskedStream {
  readonly stream: MediaStream;
  setSpot(spot: FaceSpot | null): void;
  setSticker(url: string): void;
  start(): void;
  pause(): void;
  /** 개발 빌드 측정용 */
  stats(): FaceMaskedStreamStats;
}

/** 캔버스 영상 송신이나 그리기 컨텍스트를 쓸 수 없으면 null이고, 호출부는 미지원으로 다룬다. */
export function createFaceMaskedStream(
  video: () => HTMLVideoElement | null,
): FaceMaskedStream | null {
  try {
    return buildFaceMaskedStream(video);
  } catch {
    // 지원 여부 확인을 통과하고도 생성 중에 예외를 내는 웹뷰가 있어 미지원으로 다룬다.
    return null;
  }
}

function buildFaceMaskedStream(video: () => HTMLVideoElement | null): FaceMaskedStream | null {
  const canvas = document.createElement("canvas");
  if (typeof canvas.captureStream !== "function") {
    return null;
  }
  canvas.height = SEND_HEIGHT;
  canvas.width = Math.round((SEND_HEIGHT * 16) / 9);
  const maybeContext = canvas.getContext("2d");
  const small = document.createElement("canvas");
  const maybeSmallContext = small.getContext("2d");
  if (maybeContext === null || maybeSmallContext === null) {
    return null;
  }
  const context: CanvasRenderingContext2D = maybeContext;
  const smallContext: CanvasRenderingContext2D = maybeSmallContext;
  const stream = canvas.captureStream(SEND_FPS);
  if (stream.getVideoTracks().length === 0) {
    return null;
  }

  let sticker: HTMLImageElement | null = null;
  let stickerUrl: string | null = null;
  let target: FaceSpot | null = null;
  let current: StickerPlacement | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let frames: number[] = [];
  let videoMs = 0;
  let stickerMs = 0;

  function average(previous: number, sample: number): number {
    return previous === 0 ? sample : previous * 0.9 + sample * 0.1;
  }

  function draw(): void {
    const source = video();
    if (source === null || source.readyState < 2 || source.videoWidth === 0) {
      return;
    }
    const startedAt = performance.now();
    const width = Math.round((SEND_HEIGHT * source.videoWidth) / source.videoHeight);
    if (canvas.width !== width) {
      canvas.width = width;
    }
    const mode = maskModeOf(target, sticker !== null);
    if (mode === "blur") {
      const smallHeight = Math.max(1, Math.round((BLUR_COLUMNS * canvas.height) / canvas.width));
      if (small.width !== BLUR_COLUMNS || small.height !== smallHeight) {
        small.width = BLUR_COLUMNS;
        small.height = smallHeight;
      }
      smallContext.drawImage(source, 0, 0, small.width, small.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(small, 0, 0, canvas.width, canvas.height);
    } else {
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
    }
    const videoDoneAt = performance.now();

    if (mode === "sticker" && target !== null && sticker !== null) {
      current = followSpot(current, target);
      const side = current.size * canvas.width;
      context.drawImage(
        sticker,
        current.x * canvas.width - side / 2,
        current.y * canvas.height - side / 2,
        side,
        side,
      );
    } else {
      current = null;
    }

    const now = performance.now();
    videoMs = average(videoMs, videoDoneAt - startedAt);
    stickerMs = average(stickerMs, now - videoDoneAt);
    frames = [...frames.filter((at) => now - at < 1000), now];
  }

  return {
    stream,
    setSpot(spot) {
      target = spot;
    },
    setSticker(url) {
      const image = new Image();
      stickerUrl = url;
      sticker = null;
      image.onload = () => {
        // 이모지를 빠르게 바꾸면 먼저 요청한 이미지가 늦게 도착해 새 선택을 덮을 수 있다.
        if (stickerUrl === url) {
          sticker = image;
        }
      };
      image.src = url;
    },
    start() {
      timer ??= setInterval(draw, 1000 / SEND_FPS);
    },
    pause() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
    stats() {
      const now = performance.now();
      return {
        height: canvas.height,
        fps: frames.filter((at) => now - at < 1000).length,
        videoMs: Math.round(videoMs * 10) / 10,
        stickerMs: Math.round(stickerMs * 10) / 10,
      };
    },
  };
}
