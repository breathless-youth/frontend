import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EndedSession } from "@/features/study-session/useStudyRoomSession";

import { createTimelapseRecorder, settleRecoveredTimelapse } from "../timelapseRecorder";
import type { TimelapseSettings } from "../timelapseSettings";
import { DEFAULT_TIMELAPSE_SETTINGS } from "../timelapseSettings";
import type { TimelapseStore } from "../timelapseStore";
import { createIndexedDbTimelapseStore } from "../timelapseStore";

const reportHandled = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sentry", () => ({ reportHandled }));

const T0 = Date.UTC(2026, 9, 6, 1, 0, 0);
const PHOTO = new Uint8Array([0xff, 0xd8]).buffer;
const MASKED: TimelapseSettings = {
  ...DEFAULT_TIMELAPSE_SETTINGS,
  aspect: "16:9",
  info: { ...DEFAULT_TIMELAPSE_SETTINGS.info, faceMask: true },
};

let store: TimelapseStore;
let nowMs: number;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  store = createIndexedDbTimelapseStore();
  nowMs = T0;
  reportHandled.mockReset();
});

function recorder(settings: TimelapseSettings = DEFAULT_TIMELAPSE_SETTINGS) {
  return createTimelapseRecorder({ store, loadSettings: async () => settings, now: () => nowMs });
}

function ended(focusSec: number): EndedSession {
  return { startedAtMs: T0, endedAtMs: T0 + 600_000, studySec: 600, focusSec, events: [] };
}

describe("createTimelapseRecorder", () => {
  it("기록을 열기 전에는 찍을 차례가 오지 않는다", () => {
    expect(recorder().photoTap.due()).toBeNull();
  });

  it("기록을 열면 바로 한 장, 그다음은 10초마다 세션 시작 때의 설정으로 찍는다", async () => {
    const rec = recorder(MASKED);
    rec.begin(T0);
    await rec.idle();

    expect(rec.photoTap.due()).toEqual({ aspect: "16:9", mask: true });
    rec.photoTap.save(PHOTO);
    nowMs += 9_999;
    expect(rec.photoTap.due()).toBeNull();
    nowMs += 1;
    expect(rec.photoTap.due()).not.toBeNull();
    await rec.idle();
    await expect(store.listPhotos(T0)).resolves.toHaveLength(1);
  });

  it("틱이 늦어 찍은 시각이 밀려도 다음 차례는 처음 간격 기준으로 온다", async () => {
    const rec = recorder();
    rec.begin(T0);
    await rec.idle();

    rec.photoTap.save(PHOTO);
    nowMs += 11_000;
    expect(rec.photoTap.due()).not.toBeNull();
    rec.photoTap.save(PHOTO);
    nowMs = T0 + 19_999;
    expect(rec.photoTap.due()).toBeNull();
    nowMs = T0 + 20_000;
    expect(rec.photoTap.due()).not.toBeNull();
  });

  it("저장이 꺼져 있으면 찍지 않는다", async () => {
    const rec = recorder({ ...DEFAULT_TIMELAPSE_SETTINGS, enabled: false });
    rec.begin(T0);
    await rec.idle();

    expect(rec.photoTap.due()).toBeNull();
  });

  it("이어받은 세션은 처음 설정 그대로 같은 기록에 이어 찍는다", async () => {
    await store.begin(T0, MASKED);
    await store.addPhoto(T0, PHOTO, T0);

    const rec = recorder({ ...DEFAULT_TIMELAPSE_SETTINGS, enabled: false });
    rec.begin(T0);
    await rec.idle();
    expect(rec.photoTap.due()).toEqual({ aspect: "16:9", mask: true });
    rec.photoTap.save(PHOTO);
    await rec.idle();

    expect((await store.listPhotos(T0)).map((photo) => photo.seq)).toEqual([0, 1]);
  });

  it("저장소가 늘린 간격을 다음 차례에 쓴다", async () => {
    const doubling: TimelapseStore = {
      ...store,
      addPhoto: async (startedAtMs, bytes, atMs) => {
        const record = await store.addPhoto(startedAtMs, bytes, atMs);
        return record === null ? null : { ...record, intervalMs: 20_000 };
      },
    };
    const rec = createTimelapseRecorder({
      store: doubling,
      loadSettings: async () => DEFAULT_TIMELAPSE_SETTINGS,
      now: () => nowMs,
    });
    rec.begin(T0);
    await rec.idle();

    rec.photoTap.save(PHOTO);
    await rec.idle();
    nowMs += 10_000;

    expect(rec.photoTap.due()).toBeNull();
  });
});

describe("createTimelapseRecorder 저장소 실패", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("보관 정리가 실패해도 기록을 열고 사진을 저장한다", async () => {
    const rec = createTimelapseRecorder({
      store: {
        ...store,
        sweep: async () => {
          throw new Error("sweep 실패");
        },
      },
      loadSettings: async () => DEFAULT_TIMELAPSE_SETTINGS,
      now: () => nowMs,
    });
    rec.begin(T0);
    await rec.idle();

    expect(rec.photoTap.due()).not.toBeNull();
    rec.photoTap.save(PHOTO);
    await rec.idle();

    await expect(store.listPhotos(T0)).resolves.toHaveLength(1);
  });

  it("사진 저장이 한 번 실패해도 다음 사진과 종료 정리는 이어진다", async () => {
    let failOnce = true;
    const rec = createTimelapseRecorder({
      store: {
        ...store,
        addPhoto: async (startedAtMs, bytes, atMs) => {
          if (failOnce) {
            failOnce = false;
            throw new Error("addPhoto 실패");
          }
          return await store.addPhoto(startedAtMs, bytes, atMs);
        },
      },
      loadSettings: async () => DEFAULT_TIMELAPSE_SETTINGS,
      now: () => nowMs,
    });
    rec.begin(T0);
    await rec.idle();

    rec.photoTap.save(PHOTO);
    nowMs += 10_000;
    rec.photoTap.save(PHOTO);
    rec.finish(ended(600));
    await rec.idle();

    const [ready] = await store.listReady();
    expect(ready).toMatchObject({ startedAtMs: T0, photoCount: 1 });
  });

  it("저장 실패는 세션에 한 번만 Sentry에 보고하고 메시지만 싣는다", async () => {
    const rec = createTimelapseRecorder({
      store: {
        ...store,
        addPhoto: async () => {
          throw Object.assign(new Error("addPhoto 실패"), { bytes: PHOTO });
        },
      },
      loadSettings: async () => DEFAULT_TIMELAPSE_SETTINGS,
      now: () => nowMs,
    });
    rec.begin(T0);
    await rec.idle();

    rec.photoTap.save(PHOTO);
    nowMs += 10_000;
    rec.photoTap.save(PHOTO);
    await rec.idle();

    expect(reportHandled).toHaveBeenCalledTimes(1);
    const [reported, tag] = reportHandled.mock.calls[0] as [Error, string];
    expect(tag).toBe("timelapse-store");
    expect(reported).toBeInstanceOf(Error);
    expect(reported.message).toBe("addPhoto 실패");
    expect(reported).not.toHaveProperty("bytes");
  });

  it("사진 실패는 저장 실패와 다른 종류로 세션에 한 번만 보고한다", async () => {
    const rec = recorder();
    rec.begin(T0);
    await rec.idle();

    rec.photoTap.fail(new Error("스티커 응답 404"));
    rec.photoTap.fail("convertToBlob 실패");

    expect(reportHandled).toHaveBeenCalledTimes(1);
    expect(reportHandled).toHaveBeenCalledWith(
      expect.objectContaining({ message: "스티커 응답 404" }),
      "timelapse-photo",
    );
  });
});

describe("createTimelapseRecorder 종료", () => {
  it("순공 1분 이상으로 끝나면 요약과 함께 목록에 올리고 그 뒤 사진은 버린다", async () => {
    const rec = recorder();
    rec.begin(T0);
    await rec.idle();
    rec.photoTap.save(PHOTO);

    rec.finish(ended(60));
    rec.photoTap.save(PHOTO);
    await rec.idle();

    const [ready] = await store.listReady();
    expect(ready).toMatchObject({
      startedAtMs: T0,
      photoCount: 1,
      summary: { endedAtMs: T0 + 600_000, studySec: 600, focusSec: 60, events: [] },
    });
    expect(rec.photoTap.due()).toBeNull();
  });

  it("순공 1분 미만이면 사진째 지운다", async () => {
    const rec = recorder();
    rec.begin(T0);
    await rec.idle();
    rec.photoTap.save(PHOTO);

    rec.finish(ended(59));
    await rec.idle();

    await expect(store.listReady()).resolves.toEqual([]);
    await expect(store.listPhotos(T0)).resolves.toEqual([]);
  });

  it("기록을 열기 전에 끝나도 열지 않고 끝낸다", async () => {
    const rec = recorder();
    rec.begin(T0);
    rec.finish(ended(600));
    await rec.idle();

    await expect(store.listReady()).resolves.toEqual([]);
    expect(rec.photoTap.due()).toBeNull();
  });
});

describe("settleRecoveredTimelapse", () => {
  const RECOVERED = {
    statDate: "2026-10-06",
    startedAt: new Date(T0).toISOString(),
    endedAt: new Date(T0 + 1_800_000).toISOString(),
    studySec: 1_800,
    focusSec: 1_500,
  };

  it("복구 응답의 시작 시각과 같은 촬영 중 기록을 요약과 함께 목록에 올린다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);
    await store.addPhoto(T0, PHOTO, T0);

    await settleRecoveredTimelapse(RECOVERED, store);

    const [ready] = await store.listReady();
    expect(ready?.summary).toEqual({
      endedAtMs: T0 + 1_800_000,
      studySec: 1_800,
      focusSec: 1_500,
    });
  });

  it("복구한 세션의 순공이 1분 미만이면 지운다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);
    await store.addPhoto(T0, PHOTO, T0);

    await settleRecoveredTimelapse({ ...RECOVERED, focusSec: 30 }, store);

    await expect(store.listPhotos(T0)).resolves.toEqual([]);
  });

  it("기기에서 이미 목록에 올린 타임랩스는 서버 순공이 1분 미만이어도 지우지 않는다", async () => {
    const rec = recorder();
    rec.begin(T0);
    await rec.idle();
    rec.photoTap.save(PHOTO);
    rec.finish(ended(75));
    await rec.idle();

    await settleRecoveredTimelapse({ ...RECOVERED, focusSec: 45 }, store);

    await expect(store.listReady()).resolves.toHaveLength(1);
    await expect(store.listPhotos(T0)).resolves.toHaveLength(1);
  });

  it("정리에 실패하면 throw하지 않고 Sentry에 보고한다", async () => {
    await expect(
      settleRecoveredTimelapse(RECOVERED, {
        ...store,
        finalize: async () => {
          throw new Error("finalize 실패");
        },
      }),
    ).resolves.toBeUndefined();

    expect(reportHandled).toHaveBeenCalledWith(
      expect.objectContaining({ message: "finalize 실패" }),
      "timelapse-store",
    );
  });
});
