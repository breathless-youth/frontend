import { TIMELAPSE_FPS } from "./timelapseFrame";

/**
 * 공유용 영상 인코딩 출구
 *
 * 캔버스에 그린 장면을 차례로 받아 mp4로 묶는다.
 * WebCodecs는 실시간보다 빠르고, 인코더가 없는 iOS 15.1~16.3은 실시간 녹화로 만든다.
 */

/** 720×1280 30초가 약 9MB다. */
export const VIDEO_BITRATE = 2_500_000;
const MP4 = "video/mp4";

export type VideoMethod = "webcodecs" | "recorder";

export interface VideoSink {
  readonly method: VideoMethod;
  /** 지금 캔버스 장면을 index번째 장면으로 넣는다. 끝나면 다음 장면을 그려도 된다. */
  add(index: number): Promise<void>;
  finish(): Promise<{ bytes: ArrayBuffer; mimeType: string }>;
  cancel(): void;
}

export async function openWebCodecsSink(canvas: HTMLCanvasElement): Promise<VideoSink | null> {
  if (typeof VideoEncoder === "undefined") {
    return null;
  }
  // 결과 화면 첫 청크에 들어가지 않게 여기서만 불러온다.
  const mb = await import("mediabunny");
  const quality = new mb.Quality({ bitrate: VIDEO_BITRATE });
  const supported = await mb.canEncodeVideo("avc", {
    width: canvas.width,
    height: canvas.height,
    quality,
  });
  if (!supported) {
    return null;
  }
  const target = new mb.BufferTarget();
  const output = new mb.Output({
    format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  const source = new mb.CanvasSource(canvas, { codec: "avc", quality });
  output.addVideoTrack(source, { frameRate: TIMELAPSE_FPS });
  await output.start();
  return {
    method: "webcodecs",
    add: (index) => source.add(index / TIMELAPSE_FPS, 1 / TIMELAPSE_FPS),
    async finish() {
      await output.finalize();
      if (target.buffer === null) {
        throw new Error("mp4 버퍼가 비었다");
      }
      return { bytes: target.buffer, mimeType: MP4 };
    },
    cancel() {
      void output.cancel().catch(() => {});
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function openRecorderSink(
  canvas: HTMLCanvasElement,
  wait: (ms: number) => Promise<void> = sleep,
  now: () => number = () => performance.now(),
): VideoSink | null {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof canvas.captureStream !== "function" ||
    !MediaRecorder.isTypeSupported(MP4)
  ) {
    return null;
  }
  let stream: MediaStream;
  try {
    // 0이면 requestFrame을 부를 때만 한 장을 넘긴다. 그리는 중간 상태가 섞이지 않는다.
    stream = canvas.captureStream(0);
  } catch {
    // 명세상 captureStream도 throw 할 수 있어 그때는 녹화 경로를 포기한다.
    return null;
  }
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  if (track === undefined) {
    return null;
  }
  const stopTracks = () => stream.getTracks().forEach((each) => each.stop());
  const chunks: Blob[] = [];
  let resolveStopped = () => {};
  let rejectStopped = (_reason: Error) => {};
  const stopped = new Promise<void>((resolve, reject) => {
    resolveStopped = resolve;
    rejectStopped = reject;
  });
  // 녹화 오류는 finish를 기다리기 전에 날 수 있어 미리 받아 둔다.
  void stopped.catch(() => {});
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: MP4, videoBitsPerSecond: VIDEO_BITRATE });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onstop = () => resolveStopped();
    recorder.onerror = () => rejectStopped(new Error("녹화가 중단됐다"));
    recorder.start();
  } catch {
    // 지원한다고 답해도 만들기나 시작에서 실패하는 기기가 있어 녹화 경로를 포기한다.
    stopTracks();
    return null;
  }
  const startedAt = now();
  const stop = () => {
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    stopTracks();
  };
  return {
    method: "recorder",
    async add(index) {
      track.requestFrame();
      // 녹화는 벽시계로 장면 길이를 정하므로 그리기에 쓴 시간을 빼고 이 장면이 끝날 시각까지만 기다린다.
      const due = startedAt + ((index + 1) * 1000) / TIMELAPSE_FPS;
      await wait(Math.max(0, due - now()));
    },
    async finish() {
      stop();
      await stopped;
      const file = new Blob(chunks);
      if (file.size === 0) {
        throw new Error("녹화 결과가 비었다");
      }
      return { bytes: await file.arrayBuffer(), mimeType: MP4 };
    },
    cancel: stop,
  };
}

export async function openVideoSink(canvas: HTMLCanvasElement): Promise<VideoSink | null> {
  // 청크를 받지 못하는 등 WebCodecs 확인이 실패해도 녹화로 만들 수 있다.
  const webCodecs = await openWebCodecsSink(canvas).catch(() => null);
  return webCodecs ?? openRecorderSink(canvas);
}
