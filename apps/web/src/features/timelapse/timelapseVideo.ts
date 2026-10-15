import {
  canvasSizeFor,
  drawTimelapseFrame,
  savedOverlayFor,
  TIMELAPSE_FONT_FAMILY,
  timelapseGlyphs,
} from "./timelapseFrame";
import type { TimelapseAspect } from "./timelapseSettings";
import type { TimelapseStore } from "./timelapseStore";
import { decodeJpeg } from "./useTimelapsePlayer";
import { openVideoSink, type VideoMethod, type VideoSink } from "./videoSinks";

/**
 * 공유·저장용 타임랩스 영상 만들기
 *
 * 재생기와 같은 drawTimelapseFrame으로 그려 화면과 파일이 같다.
 * 오버레이는 레코드에 남긴 설정과 그날의 D-Day·연속 공부로 그려, 어디서 만들어도 같은 영상이 나온다.
 */

/** 저장된 사진의 긴 변 1280과 맞춘 짧은 변 */
export const VIDEO_SHORT_EDGE = 720;

export type VideoFailStage = "unsupported" | "decode" | "encode" | "store";

export class TimelapseVideoError extends Error {
  readonly method: VideoMethod | "none";
  readonly stage: VideoFailStage;

  constructor(method: VideoMethod | "none", stage: VideoFailStage, options?: ErrorOptions) {
    super(`타임랩스 영상을 만들지 못했다: ${stage}`, options);
    this.name = "TimelapseVideoError";
    this.method = method;
    this.stage = stage;
  }
}

export interface BuiltVideo {
  readonly bytes: ArrayBuffer;
  readonly mimeType: string;
  readonly method: VideoMethod;
  readonly frames: number;
  readonly aspect: TimelapseAspect;
}

export interface VideoBuildDeps {
  openSink(canvas: HTMLCanvasElement): Promise<VideoSink | null>;
  decode(bytes: ArrayBuffer): Promise<ImageBitmap>;
  loadFonts(glyphs: string): Promise<void>;
  createCanvas(): HTMLCanvasElement;
}

const browserDeps: VideoBuildDeps = {
  openSink: openVideoSink,
  decode: decodeJpeg,
  async loadFonts(glyphs) {
    await document.fonts?.load(`800 16px ${TIMELAPSE_FONT_FAMILY}`, glyphs);
  },
  createCanvas: () => document.createElement("canvas"),
};

export async function buildTimelapseVideo(
  startedAtMs: number,
  store: TimelapseStore,
  onProgress: (progress: number) => void,
  deps: VideoBuildDeps = browserDeps,
): Promise<BuiltVideo> {
  const record = await store.get(startedAtMs);
  if (record?.status !== "ready") {
    throw new Error("보관된 타임랩스가 없다");
  }
  const photos = await store.listPhotos(startedAtMs);
  const overlay = savedOverlayFor(record);
  // 글꼴을 받지 못해도 시스템 글꼴로 만든다. 공유를 막을 만한 일은 아니다.
  await deps.loadFonts(timelapseGlyphs(overlay.text)).catch(() => {});

  const aspect = record.settings.aspect;
  const base = canvasSizeFor(aspect);
  const scale = VIDEO_SHORT_EDGE / Math.min(base.width, base.height);
  const canvas = deps.createCanvas();
  canvas.width = Math.round(base.width * scale);
  canvas.height = Math.round(base.height * scale);
  const ctx = canvas.getContext("2d");
  const sink = ctx === null ? null : await deps.openSink(canvas);
  if (ctx === null || sink === null) {
    throw new TimelapseVideoError("none", "unsupported");
  }

  const lastIndex = Math.max(1, photos.length - 1);
  let frames = 0;
  let reported = 0;
  try {
    for (const [index, photo] of photos.entries()) {
      let bitmap: ImageBitmap;
      try {
        bitmap = await deps.decode(photo.bytes);
      } catch {
        // 재생기처럼 깨진 사진은 건너뛴다.
        continue;
      }
      try {
        drawTimelapseFrame(ctx, {
          width: canvas.width,
          height: canvas.height,
          ...overlay,
          photo: bitmap,
          progress: index / lastIndex,
        });
      } finally {
        bitmap.close();
      }
      await sink.add(frames);
      frames += 1;
      reported = (index + 1) / photos.length;
      onProgress(reported);
    }
  } catch (error) {
    sink.cancel();
    throw new TimelapseVideoError(sink.method, "encode", { cause: error });
  }
  if (frames === 0) {
    sink.cancel();
    throw new TimelapseVideoError(sink.method, "decode");
  }
  let file: { bytes: ArrayBuffer; mimeType: string };
  try {
    file = await sink.finish();
  } catch (error) {
    sink.cancel();
    throw new TimelapseVideoError(sink.method, "encode", { cause: error });
  }
  // 마지막 사진이 깨졌으면 진행률이 1에 못 미친 채 끝나므로 여기서 채운다.
  if (reported < 1) {
    onProgress(1);
  }
  return { ...file, method: sink.method, frames, aspect };
}
