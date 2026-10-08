import "fake-indexeddb/auto";
import { QueryClient } from "@tanstack/react-query";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { trackTimelapseVideoCreated, trackTimelapseVideoFailed } from "@/lib/amplitude";

import {
  recentTimelapsesQuery,
  timelapseVideoProgressKey,
  timelapseVideoQuery,
} from "../timelapseQueries";
import { DEFAULT_TIMELAPSE_SETTINGS } from "../timelapseSettings";
import type { TimelapseStore } from "../timelapseStore";
import { createIndexedDbTimelapseStore } from "../timelapseStore";
import { TimelapseVideoError, type BuiltVideo } from "../timelapseVideo";

vi.mock("@/lib/amplitude", () => ({
  trackTimelapseVideoCreated: vi.fn(),
  trackTimelapseVideoFailed: vi.fn(),
}));

let store: TimelapseStore;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  store = createIndexedDbTimelapseStore();
});

describe("recentTimelapsesQuery", () => {
  it("기한 정리가 실패해도 목록은 읽는다", async () => {
    const startedAtMs = Date.now() - 3_600_000;
    await store.begin(startedAtMs, DEFAULT_TIMELAPSE_SETTINGS);
    await store.addPhoto(startedAtMs, new Uint8Array([1]).buffer, startedAtMs);
    await store.finalize(startedAtMs, {
      endedAtMs: startedAtMs + 600_000,
      studySec: 600,
      focusSec: 500,
    });
    const failingSweep: TimelapseStore = {
      ...store,
      sweep: () => Promise.reject(new Error("트랜잭션 중단")),
    };

    const records = await new QueryClient().fetchQuery(recentTimelapsesQuery(failingSweep));

    expect(records.map((record) => record.startedAtMs)).toEqual([startedAtMs]);
  });
});

describe("timelapseVideoQuery", () => {
  const startedAtMs = Date.UTC(2026, 9, 8, 0, 0);
  const built: BuiltVideo = {
    bytes: new Uint8Array([3]).buffer,
    mimeType: "video/mp4",
    method: "webcodecs",
    frames: 2,
    aspect: "9:16",
  };

  async function ready() {
    await store.begin(startedAtMs, DEFAULT_TIMELAPSE_SETTINGS);
    await store.addPhoto(startedAtMs, new Uint8Array([1]).buffer, startedAtMs);
    await store.finalize(startedAtMs, {
      endedAtMs: startedAtMs + 600_000,
      studySec: 600,
      focusSec: 500,
    });
  }

  beforeEach(() => {
    vi.mocked(trackTimelapseVideoCreated).mockClear();
    vi.mocked(trackTimelapseVideoFailed).mockClear();
  });

  it("보관된 영상이 있으면 다시 만들지 않는다", async () => {
    await ready();
    await store.putVideo({ startedAtMs, bytes: new Uint8Array([8]).buffer, mimeType: "video/mp4" });
    const build = vi.fn();

    const blob = await new QueryClient().fetchQuery(timelapseVideoQuery(startedAtMs, store, build));

    expect(build).not.toHaveBeenCalled();
    expect(blob.type).toBe("video/mp4");
    expect(blob.size).toBe(1);
  });

  it("없으면 만들어 보관하고 진행률과 측정 이벤트를 남긴다", async () => {
    await ready();
    const client = new QueryClient();
    const build = vi.fn(
      async (_ms: number, _store: unknown, onProgress: (progress: number) => void) => {
        onProgress(0.5);
        return built;
      },
    );

    const blob = await client.fetchQuery(timelapseVideoQuery(startedAtMs, store, build));

    expect(blob.size).toBe(1);
    expect(client.getQueryData(timelapseVideoProgressKey(startedAtMs))).toBe(0.5);
    expect(new Uint8Array((await store.getVideo(startedAtMs))!.bytes)[0]).toBe(3);
    expect(trackTimelapseVideoCreated).toHaveBeenCalledWith(
      expect.objectContaining({ method: "webcodecs", bytes: 1, frames: 2, aspect: "9:16" }),
    );
  });

  it("동시에 두 번 불러도 한 번만 만든다", async () => {
    await ready();
    const client = new QueryClient();
    const build = vi.fn(() => Promise.resolve(built));

    await Promise.all([
      client.fetchQuery(timelapseVideoQuery(startedAtMs, store, build)),
      client.prefetchQuery(timelapseVideoQuery(startedAtMs, store, build)),
    ]);

    expect(build).toHaveBeenCalledTimes(1);
  });

  it("만들기에 실패하면 단계를 남기고 다시 시도하지 않는다", async () => {
    await ready();
    const build = vi.fn(() => Promise.reject(new TimelapseVideoError("none", "unsupported")));

    await expect(
      new QueryClient().fetchQuery(timelapseVideoQuery(startedAtMs, store, build)),
    ).rejects.toBeInstanceOf(TimelapseVideoError);

    expect(build).toHaveBeenCalledTimes(1);
    expect(trackTimelapseVideoFailed).toHaveBeenCalledWith({
      method: "none",
      stage: "unsupported",
    });
  });

  it("보관에 실패해도 만든 영상은 돌려준다", async () => {
    await ready();
    const failingPut: TimelapseStore = {
      ...store,
      putVideo: () => Promise.reject(new Error("용량 초과")),
    };

    const blob = await new QueryClient().fetchQuery(
      timelapseVideoQuery(startedAtMs, failingPut, () => Promise.resolve(built)),
    );

    expect(blob.size).toBe(1);
    expect(trackTimelapseVideoFailed).toHaveBeenCalledWith({ method: "webcodecs", stage: "store" });
  });
});
