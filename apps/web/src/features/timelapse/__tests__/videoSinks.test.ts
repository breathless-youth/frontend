import { afterEach, describe, expect, it, vi } from "vitest";

import { TIMELAPSE_FPS } from "../timelapseFrame";
import { openRecorderSink, openVideoSink, openWebCodecsSink } from "../videoSinks";

const mb = vi.hoisted(() => ({
  canEncodeVideo: vi.fn(),
  sourceAdd: vi.fn(() => Promise.resolve()),
  finalize: vi.fn(() => Promise.resolve()),
  cancel: vi.fn(() => Promise.resolve()),
  buffer: null as ArrayBuffer | null,
}));

vi.mock("mediabunny", () => ({
  canEncodeVideo: mb.canEncodeVideo,
  Quality: class {},
  BufferTarget: class {
    get buffer() {
      return mb.buffer;
    }
  },
  Mp4OutputFormat: class {},
  CanvasSource: class {
    add = mb.sourceAdd;
  },
  Output: class {
    addVideoTrack() {}
    start() {
      return Promise.resolve();
    }
    finalize = mb.finalize;
    cancel = mb.cancel;
  },
}));

// jsdom의 Blob에는 arrayBuffer가 없다. 브라우저는 모두 지원하므로 테스트에서만 FileReader로 채운다.
Blob.prototype.arrayBuffer ??= function (this: Blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(this);
  });
};

function canvas(): HTMLCanvasElement {
  const element = document.createElement("canvas");
  element.width = 720;
  element.height = 1280;
  return element;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  mb.buffer = null;
  FakeRecorder.last = null;
});

describe("openWebCodecsSink", () => {
  it("VideoEncoder가 없으면 null이다", async () => {
    await expect(openWebCodecsSink(canvas())).resolves.toBeNull();
  });

  it("H.264를 인코딩할 수 없으면 null이다", async () => {
    vi.stubGlobal("VideoEncoder", class {});
    mb.canEncodeVideo.mockResolvedValue(false);

    await expect(openWebCodecsSink(canvas())).resolves.toBeNull();
  });

  it("장면 번호를 12fps 시각으로 넣고 mp4 바이트를 돌려준다", async () => {
    vi.stubGlobal("VideoEncoder", class {});
    mb.canEncodeVideo.mockResolvedValue(true);
    mb.buffer = new Uint8Array([9]).buffer;

    const sink = await openWebCodecsSink(canvas());
    await sink!.add(0);
    await sink!.add(3);
    const out = await sink!.finish();

    expect(sink!.method).toBe("webcodecs");
    expect(mb.sourceAdd).toHaveBeenNthCalledWith(1, 0, 1 / TIMELAPSE_FPS);
    expect(mb.sourceAdd).toHaveBeenNthCalledWith(2, 3 / TIMELAPSE_FPS, 1 / TIMELAPSE_FPS);
    expect(out.mimeType).toBe("video/mp4");
    expect(new Uint8Array(out.bytes)[0]).toBe(9);
  });
});

class FakeRecorder {
  static isTypeSupported = vi.fn(() => true);
  static last: FakeRecorder | null = null;
  readonly stream: MediaStream;
  readonly options: MediaRecorderOptions;
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  constructor(stream: MediaStream, options: MediaRecorderOptions) {
    this.stream = stream;
    this.options = options;
    FakeRecorder.last = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array([5])]) });
    this.onstop?.();
  }
}

function capturableCanvas() {
  const requestFrame = vi.fn();
  const stopTrack = vi.fn();
  const element = canvas();
  const track = { requestFrame, stop: stopTrack };
  Object.assign(element, {
    captureStream: vi.fn(() => ({ getVideoTracks: () => [track], getTracks: () => [track] })),
  });
  return { element, requestFrame, stopTrack };
}

describe("openRecorderSink", () => {
  it("mp4 녹화를 지원하지 않으면 null이다", () => {
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    FakeRecorder.isTypeSupported.mockReturnValueOnce(false);

    expect(openRecorderSink(capturableCanvas().element)).toBeNull();
  });

  it("장면마다 프레임을 요청하고 1/12초씩 기다린 뒤 mp4 바이트를 돌려준다", async () => {
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const { element, requestFrame, stopTrack } = capturableCanvas();
    const wait = vi.fn(() => Promise.resolve());

    const sink = openRecorderSink(element, wait)!;
    await sink.add(0);
    await sink.add(1);
    const out = await sink.finish();

    expect(sink.method).toBe("recorder");
    expect(FakeRecorder.last?.options).toMatchObject({ mimeType: "video/mp4" });
    expect(requestFrame).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(1000 / TIMELAPSE_FPS);
    expect(stopTrack).toHaveBeenCalled();
    expect(out.mimeType).toBe("video/mp4");
    expect(new Uint8Array(out.bytes)[0]).toBe(5);
  });

  it("캔버스 스트림에 비디오 트랙이 없으면 null이다", () => {
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const element = canvas();
    Object.assign(element, {
      captureStream: vi.fn(() => ({ getVideoTracks: () => [], getTracks: () => [] })),
    });

    expect(openRecorderSink(element)).toBeNull();
    expect(FakeRecorder.last).toBeNull();
  });

  it("captureStream이 예외를 던지면 null이다", () => {
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const element = canvas();
    Object.assign(element, {
      captureStream: vi.fn(() => {
        throw new Error("SecurityError");
      }),
    });

    expect(openRecorderSink(element)).toBeNull();
    expect(FakeRecorder.last).toBeNull();
  });

  it("MediaRecorder를 만들지 못하면 트랙을 정리하고 null이다", () => {
    vi.stubGlobal(
      "MediaRecorder",
      class {
        static isTypeSupported = () => true;
        constructor() {
          throw new Error("NotSupportedError");
        }
      },
    );
    const { element, stopTrack } = capturableCanvas();

    expect(openRecorderSink(element)).toBeNull();
    expect(stopTrack).toHaveBeenCalled();
  });

  it("녹화 결과가 비어 있으면 finish가 실패한다", async () => {
    class EmptyRecorder extends FakeRecorder {
      stop() {
        this.state = "inactive";
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", EmptyRecorder);
    const sink = openRecorderSink(capturableCanvas().element, () => Promise.resolve())!;
    await sink.add(0);

    await expect(sink.finish()).rejects.toThrow();
  });

  it("녹화 오류가 나면 finish가 실패한다", async () => {
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const sink = openRecorderSink(capturableCanvas().element, () => Promise.resolve())!;
    await sink.add(0);
    FakeRecorder.last!.onerror?.(new Event("error"));

    await expect(sink.finish()).rejects.toThrow();
  });
});

describe("openVideoSink", () => {
  it("WebCodecs가 안 되면 녹화로 넘어간다", async () => {
    vi.stubGlobal("MediaRecorder", FakeRecorder);

    const sink = await openVideoSink(capturableCanvas().element);

    expect(sink?.method).toBe("recorder");
  });

  it("둘 다 안 되면 null이다", async () => {
    await expect(openVideoSink(canvas())).resolves.toBeNull();
  });
});
