import type { StatusEventPayload } from "@focusmakers/types";
import type { DBSchema, IDBPDatabase } from "idb";
import { openDB } from "idb";

import {
  CAPTURE_START_INTERVAL_MS,
  FINAL_PHOTO_COUNT,
  THIN_AT_COUNT,
  selectEvenly,
  thinningDrops,
} from "./captureSchedule";
import type { TimelapseSettings } from "./timelapseSettings";

/**
 * 타임랩스 기기 보관소
 *
 * 사진은 기기 밖으로 나가지 않고 이 IndexedDB에만 남는다.
 * 세션 시작 시각이 세션을 가르는 유일한 값이라 기록의 키로 쓴다.
 * 서버도 같은 시각을 세션의 멱등 키로 쓰므로 복구 응답의 시작 시각과 그대로 맞는다.
 * 사진은 Blob이 아니라 ArrayBuffer로 둔다.
 * 옛 iOS WebKit은 IndexedDB에 넣은 Blob을 잃는 결함이 있었다.
 * 테스트의 jsdom Blob은 fake-indexeddb에 넣으면 빈 객체로 돌아와 저장 코드를 검증할 수 없다.
 */

const DB_NAME = "focuson-timelapse";
const DAY_MS = 86_400_000;
export const KEEP_MS = 7 * DAY_MS;
export const KEEP_COUNT = 7;

/** 목록과 재생이 읽는, 세션이 끝난 뒤 기기가 잰 요약 */
export interface TimelapseSummary {
  readonly endedAtMs: number;
  readonly studySec: number;
  readonly focusSec: number;
  /**
   * 결과 화면 타임라인과 같은 비공부 구간
   *
   * 앱 실행 복구로 끝난 세션은 서버가 구간을 주지 않아 없다.
   */
  readonly events?: readonly StatusEventPayload[];
}

export interface TimelapseRecord {
  readonly startedAtMs: number;
  /** 촬영 중 기록은 목록에 나오지 않고 보관 개수에도 들지 않는다. */
  readonly status: "recording" | "ready";
  /** 세션을 시작할 때의 설정이고, 이 타임랩스는 끝까지 이 설정으로 재생된다. */
  readonly settings: TimelapseSettings;
  readonly intervalMs: number;
  readonly nextSeq: number;
  readonly photoCount: number;
  readonly summary?: TimelapseSummary;
  /** 결과 화면에서 받은 그날의 D-Day 표기. 나중에 다시 볼 때도 그날 값으로 그린다. */
  readonly ddayLabel?: string | null;
  /** 결과 화면에서 받은 그날의 연속 공부 일수 */
  readonly streakDays?: number | null;
}

/** 결과 화면이 재생할 때 레코드에 남기는 값 */
export interface TimelapseAnnotation {
  readonly ddayLabel?: string | null;
  readonly streakDays?: number | null;
}

export interface TimelapsePhoto {
  readonly startedAtMs: number;
  readonly seq: number;
  readonly atMs: number;
  /** JPEG 바이트 */
  readonly bytes: ArrayBuffer;
}

interface TimelapseDb extends DBSchema {
  timelapses: { key: number; value: TimelapseRecord };
  photos: { key: [number, number]; value: TimelapsePhoto };
}

export interface TimelapseStore {
  /**
   * 같은 시작 시각의 촬영 중 기록이 있으면 그대로 이어 쓴다.
   * 없으면 저장이 켜져 있을 때만 만든다.
   */
  begin(startedAtMs: number, settings: TimelapseSettings): Promise<TimelapseRecord | null>;
  /**
   * 촬영 중 기록에만 붙인다.
   * 720장이 되면 같은 트랜잭션에서 절반을 지우고 간격을 두 배로 늘린다.
   */
  addPhoto(startedAtMs: number, bytes: ArrayBuffer, atMs: number): Promise<TimelapseRecord | null>;
  /**
   * 고르게 360장만 남기고 목록에 올린다.
   * 사진이 하나도 없으면 기록을 지운다.
   */
  finalize(startedAtMs: number, summary: TimelapseSummary): Promise<void>;
  /**
   * 촬영 중 기록만 사진째 지운다.
   * 기기가 이미 목록에 올린 타임랩스를 늦게 온 서버 요약이 지우면 안 된다.
   */
  discard(startedAtMs: number): Promise<void>;
  /** 상태와 관계없이 지우므로 사용자가 직접 지울 때만 쓴다. */
  remove(startedAtMs: number): Promise<void>;
  /**
   * 7일이 지났거나 최신 7개 밖인 기록을 지운다.
   * 촬영 중 기록은 개수에 넣지 않고 7일만 본다.
   */
  sweep(nowMs: number): Promise<void>;
  /** 목록에 보일 기록을 최신부터 준다. */
  listReady(): Promise<TimelapseRecord[]>;
  get(startedAtMs: number): Promise<TimelapseRecord | null>;
  /** 목록에 올린 기록에만 더하고, 촬영 중이거나 없는 기록은 그대로 둔다. */
  annotate(startedAtMs: number, patch: TimelapseAnnotation): Promise<void>;
  /** 한 타임랩스의 사진을 찍은 순서로 준다. */
  listPhotos(startedAtMs: number): Promise<TimelapsePhoto[]>;
  /** 썸네일용으로 가운데 사진 한 장만 읽는다. 사진이 없으면 null이다. */
  middlePhoto(startedAtMs: number): Promise<ArrayBuffer | null>;
}

function photoRange(startedAtMs: number): IDBKeyRange {
  return IDBKeyRange.bound([startedAtMs, 0], [startedAtMs, Infinity]);
}

export function createIndexedDbTimelapseStore(): TimelapseStore {
  let opening: Promise<IDBPDatabase<TimelapseDb>> | null = null;

  function database(): Promise<IDBPDatabase<TimelapseDb>> {
    // 실패한 promise를 들고 있으면 다음 세션도 열지 못한다.
    opening ??= openDB<TimelapseDb>(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore("timelapses", { keyPath: "startedAtMs" });
        db.createObjectStore("photos", { keyPath: ["startedAtMs", "seq"] });
      },
    }).catch((error: unknown) => {
      opening = null;
      throw error;
    });
    return opening;
  }

  return {
    async begin(startedAtMs, settings) {
      const tx = (await database()).transaction("timelapses", "readwrite");
      const existing = await tx.store.get(startedAtMs);
      let record: TimelapseRecord | null = null;
      if (existing !== undefined) {
        record = existing.status === "recording" ? existing : null;
      } else if (settings.enabled) {
        record = {
          startedAtMs,
          status: "recording",
          settings,
          intervalMs: CAPTURE_START_INTERVAL_MS,
          nextSeq: 0,
          photoCount: 0,
        };
        await tx.store.put(record);
      }
      await tx.done;
      return record;
    },

    async addPhoto(startedAtMs, bytes, atMs) {
      const tx = (await database()).transaction(["timelapses", "photos"], "readwrite");
      const records = tx.objectStore("timelapses");
      const photos = tx.objectStore("photos");
      const record = await records.get(startedAtMs);
      if (record === undefined || record.status !== "recording") {
        await tx.done;
        return null;
      }
      await photos.put({ startedAtMs, seq: record.nextSeq, atMs, bytes });
      let next: TimelapseRecord = {
        ...record,
        nextSeq: record.nextSeq + 1,
        photoCount: record.photoCount + 1,
      };
      if (next.photoCount >= THIN_AT_COUNT) {
        const keys = await photos.getAllKeys(photoRange(startedAtMs));
        const drops = thinningDrops(keys);
        await Promise.all(drops.map((key) => photos.delete(key)));
        next = {
          ...next,
          photoCount: keys.length - drops.length,
          intervalMs: record.intervalMs * 2,
        };
      }
      await records.put(next);
      await tx.done;
      return next;
    },

    async finalize(startedAtMs, summary) {
      const tx = (await database()).transaction(["timelapses", "photos"], "readwrite");
      const records = tx.objectStore("timelapses");
      const photos = tx.objectStore("photos");
      const record = await records.get(startedAtMs);
      if (record === undefined || record.status !== "recording") {
        await tx.done;
        return;
      }
      const keys = await photos.getAllKeys(photoRange(startedAtMs));
      if (keys.length === 0) {
        await records.delete(startedAtMs);
        await tx.done;
        return;
      }
      const kept = new Set(selectEvenly(keys, FINAL_PHOTO_COUNT));
      await Promise.all(keys.filter((key) => !kept.has(key)).map((key) => photos.delete(key)));
      await records.put({ ...record, status: "ready", photoCount: kept.size, summary });
      await tx.done;
    },

    async discard(startedAtMs) {
      const tx = (await database()).transaction(["timelapses", "photos"], "readwrite");
      const record = await tx.objectStore("timelapses").get(startedAtMs);
      if (record?.status === "recording") {
        await Promise.all([
          tx.objectStore("timelapses").delete(startedAtMs),
          tx.objectStore("photos").delete(photoRange(startedAtMs)),
        ]);
      }
      await tx.done;
    },

    async remove(startedAtMs) {
      const tx = (await database()).transaction(["timelapses", "photos"], "readwrite");
      await Promise.all([
        tx.objectStore("timelapses").delete(startedAtMs),
        tx.objectStore("photos").delete(photoRange(startedAtMs)),
      ]);
      await tx.done;
    },

    async sweep(nowMs) {
      const tx = (await database()).transaction(["timelapses", "photos"], "readwrite");
      const records = tx.objectStore("timelapses");
      const photos = tx.objectStore("photos");
      const all = await records.getAll();
      const expired = (record: TimelapseRecord) => nowMs - record.startedAtMs > KEEP_MS;
      const ready = all
        .filter((record) => record.status === "ready")
        .sort((a, b) => b.startedAtMs - a.startedAtMs);
      const doomed = [
        ...ready.filter((record, index) => index >= KEEP_COUNT || expired(record)),
        ...all.filter((record) => record.status === "recording" && expired(record)),
      ];
      await Promise.all(
        doomed.flatMap((record) => [
          records.delete(record.startedAtMs),
          photos.delete(photoRange(record.startedAtMs)),
        ]),
      );
      await tx.done;
    },

    async listReady() {
      const all = await (await database()).getAll("timelapses");
      return all
        .filter((record) => record.status === "ready")
        .sort((a, b) => b.startedAtMs - a.startedAtMs);
    },

    async get(startedAtMs) {
      return (await (await database()).get("timelapses", startedAtMs)) ?? null;
    },

    async annotate(startedAtMs, patch) {
      const tx = (await database()).transaction("timelapses", "readwrite");
      const record = await tx.store.get(startedAtMs);
      if (record?.status === "ready") {
        await tx.store.put({ ...record, ...patch });
      }
      await tx.done;
    },

    async listPhotos(startedAtMs) {
      return await (await database()).getAll("photos", photoRange(startedAtMs));
    },

    async middlePhoto(startedAtMs) {
      const photos = (await database()).transaction("photos").store;
      const range = photoRange(startedAtMs);
      const count = await photos.count(range);
      let cursor = await photos.openCursor(range);
      if (cursor !== null && count > 1) {
        cursor = await cursor.advance(Math.floor(count / 2));
      }
      return cursor?.value.bytes ?? null;
    },
  };
}

let shared: TimelapseStore | null = null;

/**
 * 세션 웹뷰와 앱 실행 복구가 함께 쓰는 보관소
 *
 * 처음 부를 때 DB를 연다.
 */
export function getTimelapseStore(): TimelapseStore {
  shared ??= createIndexedDbTimelapseStore();
  return shared;
}
