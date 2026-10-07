import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";

import { CAPTURE_START_INTERVAL_MS, FINAL_PHOTO_COUNT, THIN_AT_COUNT } from "../captureSchedule";
import { DEFAULT_TIMELAPSE_SETTINGS } from "../timelapseSettings";
import type { TimelapseStore } from "../timelapseStore";
import { KEEP_MS, createIndexedDbTimelapseStore } from "../timelapseStore";

/**
 * fake-indexeddb 위에서 실제 저장 코드를 돌린다.
 * 테스트마다 새 IDBFactory를 깔아 앞 테스트의 DB가 남지 않게 한다.
 */

const T0 = Date.UTC(2026, 9, 6, 1, 0, 0);
const SUMMARY = { endedAtMs: T0 + 3_600_000, studySec: 3_600, focusSec: 3_000 };

function bytes(value: number): ArrayBuffer {
  return new Uint8Array([value]).buffer;
}

/** jsdom과 Node의 ArrayBuffer가 다른 realm이라 instanceof 대신 바이트로 비교한다. */
function firstByte(buffer: ArrayBuffer): number | undefined {
  return new Uint8Array(buffer)[0];
}

async function addPhotos(store: TimelapseStore, startedAtMs: number, count: number) {
  for (let index = 0; index < count; index += 1) {
    await store.addPhoto(startedAtMs, bytes(index % 256), startedAtMs + index * 10_000);
  }
}

let store: TimelapseStore;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  store = createIndexedDbTimelapseStore();
});

describe("begin", () => {
  it("설정 스냅샷과 10초 간격으로 촬영 중 기록을 만든다", async () => {
    const settings = { ...DEFAULT_TIMELAPSE_SETTINGS, aspect: "16:9" as const };

    await expect(store.begin(T0, settings)).resolves.toEqual({
      startedAtMs: T0,
      status: "recording",
      settings,
      intervalMs: CAPTURE_START_INTERVAL_MS,
      nextSeq: 0,
      photoCount: 0,
    });
  });

  it("저장이 꺼져 있으면 만들지 않는다", async () => {
    await expect(
      store.begin(T0, { ...DEFAULT_TIMELAPSE_SETTINGS, enabled: false }),
    ).resolves.toBeNull();
    await expect(store.listPhotos(T0)).resolves.toEqual([]);
  });
});

describe("addPhoto", () => {
  it("순번을 올리며 바이트와 찍은 시각을 남긴다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);

    await store.addPhoto(T0, bytes(7), T0 + 1_000);
    const record = await store.addPhoto(T0, bytes(8), T0 + 11_000);

    expect(record).toMatchObject({ nextSeq: 2, photoCount: 2 });
    const photos = await store.listPhotos(T0);
    expect(photos.map((photo) => [photo.seq, photo.atMs, firstByte(photo.bytes)])).toEqual([
      [0, T0 + 1_000, 7],
      [1, T0 + 11_000, 8],
    ]);
  });

  it("720장이 되면 한 장 걸러 지워 360장으로 줄이고 간격을 두 배로 늘린다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);

    await addPhotos(store, T0, THIN_AT_COUNT - 1);
    const record = await store.addPhoto(T0, bytes(0), T0 + THIN_AT_COUNT * 10_000);

    expect(record).toMatchObject({
      photoCount: THIN_AT_COUNT / 2,
      nextSeq: THIN_AT_COUNT,
      intervalMs: CAPTURE_START_INTERVAL_MS * 2,
    });
    const seqs = (await store.listPhotos(T0)).map((photo) => photo.seq);
    expect(seqs).toHaveLength(THIN_AT_COUNT / 2);
    expect(seqs.slice(0, 3)).toEqual([0, 2, 4]);
  });

  it("두 번째로 720장이 차면 다시 360장으로 줄이고 간격을 40초로 늘리며 시간 순서는 고르게 남는다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);
    await addPhotos(store, T0, THIN_AT_COUNT);
    // 첫 솎기 뒤의 20초 간격으로 다시 720장을 채운다.
    const resumedAtMs = T0 + THIN_AT_COUNT * 10_000;
    let record = null;
    for (let index = 0; index < THIN_AT_COUNT / 2; index += 1) {
      record = await store.addPhoto(T0, bytes(index % 256), resumedAtMs + index * 20_000);
    }

    expect(record).toMatchObject({
      photoCount: THIN_AT_COUNT / 2,
      nextSeq: THIN_AT_COUNT + THIN_AT_COUNT / 2,
      intervalMs: CAPTURE_START_INTERVAL_MS * 4,
    });
    const photos = await store.listPhotos(T0);
    expect(photos).toHaveLength(THIN_AT_COUNT / 2);
    const gaps = photos.slice(1).map((photo, index) => photo.atMs - photos[index]!.atMs);
    expect(gaps.every((gap) => gap === 40_000)).toBe(true);
    expect(photos[0]?.atMs).toBe(T0);
  });
});

describe("begin 이어 쓰기", () => {
  it("같은 시작 시각의 촬영 중 기록은 처음 스냅샷 그대로 이어 쓴다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);
    await addPhotos(store, T0, 2);

    const resumed = await store.begin(T0, { ...DEFAULT_TIMELAPSE_SETTINGS, enabled: false });

    expect(resumed).toMatchObject({ settings: DEFAULT_TIMELAPSE_SETTINGS, nextSeq: 2 });
  });
});

describe("finalize", () => {
  it("고르게 360장만 남기고 요약과 함께 목록에 올린다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);
    await addPhotos(store, T0, 540);

    await store.finalize(T0, SUMMARY);

    const [ready] = await store.listReady();
    expect(ready).toMatchObject({
      status: "ready",
      photoCount: FINAL_PHOTO_COUNT,
      summary: SUMMARY,
    });
    const seqs = (await store.listPhotos(T0)).map((photo) => photo.seq);
    expect(seqs).toHaveLength(FINAL_PHOTO_COUNT);
    expect(seqs[0]).toBe(0);
    expect(seqs.at(-1)).toBe(539);
  });

  it("사진이 하나도 없으면 기록을 지운다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);

    await store.finalize(T0, SUMMARY);

    await expect(store.listReady()).resolves.toEqual([]);
    await expect(
      store.begin(T0, { ...DEFAULT_TIMELAPSE_SETTINGS, enabled: false }),
    ).resolves.toBeNull();
  });
});

describe("addPhoto 끝난 기록", () => {
  it("기록이 없거나 끝난 타임랩스에는 붙이지 않는다", async () => {
    await expect(store.addPhoto(T0, bytes(1), T0)).resolves.toBeNull();

    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);
    await addPhotos(store, T0, 1);
    await store.finalize(T0, SUMMARY);

    await expect(store.addPhoto(T0, bytes(2), T0 + 1)).resolves.toBeNull();
    await expect(store.listPhotos(T0)).resolves.toHaveLength(1);
  });
});

describe("remove", () => {
  it("기록과 사진을 함께 지운다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);
    await addPhotos(store, T0, 3);

    await store.remove(T0);

    await expect(store.listPhotos(T0)).resolves.toEqual([]);
    await expect(
      store.begin(T0, { ...DEFAULT_TIMELAPSE_SETTINGS, enabled: false }),
    ).resolves.toBeNull();
  });
});

describe("discard", () => {
  it("촬영 중 기록은 사진째 지운다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);
    await addPhotos(store, T0, 2);

    await store.discard(T0);

    await expect(store.listPhotos(T0)).resolves.toEqual([]);
  });

  it("목록에 올린 기록은 지우지 않는다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);
    await addPhotos(store, T0, 2);
    await store.finalize(T0, SUMMARY);

    await store.discard(T0);

    await expect(store.listReady()).resolves.toHaveLength(1);
    await expect(store.listPhotos(T0)).resolves.toHaveLength(2);
  });
});

describe("sweep", () => {
  async function readyAt(startedAtMs: number) {
    await store.begin(startedAtMs, DEFAULT_TIMELAPSE_SETTINGS);
    await addPhotos(store, startedAtMs, 1);
    await store.finalize(startedAtMs, SUMMARY);
  }

  it("8번째 타임랩스가 생기면 가장 오래된 것을 사진째 지운다", async () => {
    for (let day = 0; day < 8; day += 1) {
      await readyAt(T0 + day * 3_600_000);
    }

    await store.sweep(T0 + 8 * 3_600_000);

    const ready = await store.listReady();
    expect(ready).toHaveLength(7);
    expect(ready.at(-1)?.startedAtMs).toBe(T0 + 3_600_000);
    await expect(store.listPhotos(T0)).resolves.toEqual([]);
  });

  it("7일이 지난 타임랩스를 지운다", async () => {
    await readyAt(T0);
    await readyAt(T0 + 1);

    await store.sweep(T0 + 1 + KEEP_MS);

    expect((await store.listReady()).map((record) => record.startedAtMs)).toEqual([T0 + 1]);
  });

  it("촬영 중 고아 기록은 목록과 개수에 들지 않고 7일 뒤에만 지운다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);
    await addPhotos(store, T0, 1);
    for (let index = 1; index <= 7; index += 1) {
      await readyAt(T0 + index);
    }

    await store.sweep(T0 + 10);
    expect(await store.listReady()).toHaveLength(7);
    await expect(store.listPhotos(T0)).resolves.toHaveLength(1);

    await store.sweep(T0 + KEEP_MS + 1);
    await expect(store.listPhotos(T0)).resolves.toEqual([]);
  });
});

describe("get", () => {
  it("저장한 기록을 주고 없는 키는 null을 준다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);

    await expect(store.get(T0)).resolves.toMatchObject({ startedAtMs: T0, status: "recording" });
    await expect(store.get(T0 + 1)).resolves.toBeNull();
  });
});

describe("annotate", () => {
  it("목록에 올린 기록에 D-Day와 연속 공부 일수를 더한다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);
    await addPhotos(store, T0, 1);
    await store.finalize(T0, SUMMARY);

    await store.annotate(T0, { ddayLabel: "D-108 · 2027 수능" });
    await store.annotate(T0, { streakDays: 5 });

    await expect(store.get(T0)).resolves.toMatchObject({
      status: "ready",
      ddayLabel: "D-108 · 2027 수능",
      streakDays: 5,
    });
  });

  it("촬영 중 기록과 없는 키는 그대로 둔다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);

    await store.annotate(T0, { streakDays: 5 });
    await store.annotate(T0 + 1, { streakDays: 5 });

    await expect(store.get(T0)).resolves.not.toHaveProperty("streakDays");
    await expect(store.get(T0 + 1)).resolves.toBeNull();
  });
});
