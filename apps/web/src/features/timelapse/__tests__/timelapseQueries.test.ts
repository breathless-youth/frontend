import "fake-indexeddb/auto";
import { QueryClient } from "@tanstack/react-query";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";

import { recentTimelapsesQuery } from "../timelapseQueries";
import { DEFAULT_TIMELAPSE_SETTINGS } from "../timelapseSettings";
import type { TimelapseStore } from "../timelapseStore";
import { createIndexedDbTimelapseStore } from "../timelapseStore";

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
