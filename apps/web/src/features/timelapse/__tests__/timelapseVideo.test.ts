import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as TimelapseFrame from "../timelapseFrame";
import { drawTimelapseFrame, type TimelapseScene } from "../timelapseFrame";
import { DEFAULT_TIMELAPSE_SETTINGS } from "../timelapseSettings";
import { createIndexedDbTimelapseStore, type TimelapseStore } from "../timelapseStore";
import { buildTimelapseVideo, TimelapseVideoError, type VideoBuildDeps } from "../timelapseVideo";
import type { VideoSink } from "../videoSinks";

vi.mock("../timelapseFrame", async (importOriginal) => ({
  ...(await importOriginal<typeof TimelapseFrame>()),
  drawTimelapseFrame: vi.fn(),
}));

const T0 = new Date(2026, 9, 8, 9, 0).getTime();
const SUMMARY = { endedAtMs: T0 + 3_600_000, studySec: 3_600, focusSec: 3_000 };

let store: TimelapseStore;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  store = createIndexedDbTimelapseStore();
  vi.mocked(drawTimelapseFrame).mockClear();
});

async function readyTimelapse(photoCount: number, aspect: "9:16" | "16:9" = "9:16") {
  await store.begin(T0, { ...DEFAULT_TIMELAPSE_SETTINGS, aspect });
  for (let index = 0; index < photoCount; index += 1) {
    await store.addPhoto(T0, new Uint8Array([index]).buffer, T0 + index * 10_000);
  }
  await store.finalize(T0, SUMMARY);
}

function fakeSink(method: VideoSink["method"] = "webcodecs") {
  return {
    method,
    add: vi.fn<VideoSink["add"]>(() => Promise.resolve()),
    finish: vi.fn(() =>
      Promise.resolve({ bytes: new Uint8Array([1]).buffer, mimeType: "video/mp4" }),
    ),
    cancel: vi.fn(),
  } satisfies VideoSink;
}

function deps(overrides: Partial<VideoBuildDeps> = {}) {
  const canvas = { width: 0, height: 0, getContext: () => ({}) } as unknown as HTMLCanvasElement;
  const bitmaps: { close: ReturnType<typeof vi.fn> }[] = [];
  const sink = fakeSink();
  const built: VideoBuildDeps = {
    createCanvas: () => canvas,
    openSink: () => Promise.resolve(sink),
    decode: () => {
      const bitmap = { close: vi.fn() };
      bitmaps.push(bitmap);
      return Promise.resolve(bitmap as unknown as ImageBitmap);
    },
    loadFonts: () => Promise.resolve(),
    ...overrides,
  };
  return { built, canvas, bitmaps, sink };
}

function scenes(): TimelapseScene[] {
  return vi.mocked(drawTimelapseFrame).mock.calls.map(([, scene]) => scene);
}

describe("buildTimelapseVideo", () => {
  it("사진마다 한 장면씩 그려 넣고 진행률을 0에서 1로 올린다", async () => {
    await readyTimelapse(3);
    const { built, sink, bitmaps } = deps();
    const progress: number[] = [];

    const video = await buildTimelapseVideo(T0, store, (value) => progress.push(value), built);

    expect(scenes().map((scene) => scene.progress)).toEqual([0, 0.5, 1]);
    expect(sink.add.mock.calls.map(([index]) => index)).toEqual([0, 1, 2]);
    expect(progress).toEqual([1 / 3, 2 / 3, 1]);
    expect(bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
    expect(video).toMatchObject({
      method: "webcodecs",
      frames: 3,
      aspect: "9:16",
      mimeType: "video/mp4",
    });
  });

  it("세로는 720×1280, 가로는 1280×720으로 만든다", async () => {
    await readyTimelapse(1, "16:9");
    const { built, canvas } = deps();

    await buildTimelapseVideo(T0, store, () => {}, built);

    expect([canvas.width, canvas.height]).toEqual([1280, 720]);
    expect(scenes()[0]).toMatchObject({ width: 1280, height: 720 });
  });

  it("레코드에 남긴 그날의 D-Day와 연속 공부를 그린다", async () => {
    await readyTimelapse(1);
    await store.annotate(T0, { ddayLabel: "D-30 · 기말고사", streakDays: 4 });
    const { built } = deps();

    await buildTimelapseVideo(T0, store, () => {}, built);

    expect(scenes()[0]?.text).toMatchObject({
      dday: "D-30 · 기말고사",
      streak: "4일 연속 공부 🔥",
    });
  });

  it("글꼴을 받지 못해도 만든다", async () => {
    await readyTimelapse(1);
    const { built } = deps({ loadFonts: () => Promise.reject(new Error("offline")) });

    await expect(buildTimelapseVideo(T0, store, () => {}, built)).resolves.toMatchObject({
      frames: 1,
    });
  });

  it("디코드에 실패한 사진은 건너뛰고 장면 번호를 비우지 않는다", async () => {
    await readyTimelapse(3);
    let call = 0;
    const { built, sink } = deps();
    const decode = built.decode;
    built.decode = (bytes) => (call++ === 1 ? Promise.reject(new Error("깨짐")) : decode(bytes));

    const video = await buildTimelapseVideo(T0, store, () => {}, built);

    expect(sink.add.mock.calls.map(([index]) => index)).toEqual([0, 1]);
    expect(video.frames).toBe(2);
  });

  it("마지막 사진을 디코드하지 못해도 진행률은 1로 끝난다", async () => {
    await readyTimelapse(3);
    let call = 0;
    const { built } = deps();
    const decode = built.decode;
    built.decode = (bytes) => (call++ === 2 ? Promise.reject(new Error("깨짐")) : decode(bytes));
    const progress: number[] = [];

    await buildTimelapseVideo(T0, store, (value) => progress.push(value), built);

    expect(progress).toEqual([1 / 3, 2 / 3, 1]);
  });

  it("파일을 마무리하지 못하면 encode 실패로 끝내고 인코더를 닫는다", async () => {
    await readyTimelapse(1);
    const sink = fakeSink("recorder");
    sink.finish.mockRejectedValueOnce(new Error("녹화 결과가 비었다"));
    const { built } = deps({ openSink: () => Promise.resolve(sink) });

    await expect(buildTimelapseVideo(T0, store, () => {}, built)).rejects.toMatchObject({
      method: "recorder",
      stage: "encode",
    });
    expect(sink.cancel).toHaveBeenCalled();
  });

  it("모든 사진을 디코드하지 못하면 decode 실패다", async () => {
    await readyTimelapse(2);
    const { built, sink } = deps({ decode: () => Promise.reject(new Error("깨짐")) });

    await expect(buildTimelapseVideo(T0, store, () => {}, built)).rejects.toMatchObject({
      method: "webcodecs",
      stage: "decode",
    });
    expect(sink.cancel).toHaveBeenCalled();
  });

  it("인코딩 방법이 없으면 unsupported 실패다", async () => {
    await readyTimelapse(1);
    const { built } = deps({ openSink: () => Promise.resolve(null) });

    const error = await buildTimelapseVideo(T0, store, () => {}, built).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TimelapseVideoError);
    expect(error).toMatchObject({ method: "none", stage: "unsupported" });
  });

  it("인코더가 장면을 받지 못하면 encode 실패로 멈춘다", async () => {
    await readyTimelapse(2);
    const sink = fakeSink("recorder");
    sink.add.mockRejectedValueOnce(new Error("인코더 닫힘"));
    const { built } = deps({ openSink: () => Promise.resolve(sink) });

    await expect(buildTimelapseVideo(T0, store, () => {}, built)).rejects.toMatchObject({
      method: "recorder",
      stage: "encode",
    });
    expect(sink.cancel).toHaveBeenCalled();
  });

  it("보관된 타임랩스가 없으면 실패한다", async () => {
    const { built } = deps();

    await expect(buildTimelapseVideo(T0, store, () => {}, built)).rejects.toThrow();
  });
});
