import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";

import { PhotoLimitError, createTimerBackgroundPhotoStore } from "../timerBackgroundPhotos";

function jpeg(byte: number) {
  return { bytes: new Uint8Array([byte]).buffer, width: 1080, height: 1920 };
}

describe("타이머 배경 사진 저장소", () => {
  beforeEach(() => {
    // 테스트마다 새 DB에서 시작한다.
    globalThis.indexedDB = new IDBFactory();
  });

  it("사진을 추가하면 기본 조정값으로 목록에 오래된 순서대로 나타난다", async () => {
    const store = createTimerBackgroundPhotoStore();

    const first = await store.add(jpeg(1), 1000);
    const second = await store.add(jpeg(2), 2000);

    const list = await store.list();
    expect(list.map((photo) => photo.id)).toEqual([first.id, second.id]);
    expect(list[0]).toMatchObject({ width: 1080, height: 1920, fit: { scale: 1, x: 50, y: 50 } });
    expect(new Uint8Array(list[1]!.bytes)).toEqual(new Uint8Array([2]));
  });

  it("10장이 찼으면 더 담지 않는다", async () => {
    const store = createTimerBackgroundPhotoStore();
    for (let index = 0; index < 10; index += 1) {
      await store.add(jpeg(index), index);
    }

    await expect(store.add(jpeg(99), 99)).rejects.toBeInstanceOf(PhotoLimitError);
    expect(await store.list()).toHaveLength(10);
  });

  it("사진을 삭제하면 목록과 조회에서 빠진다", async () => {
    const store = createTimerBackgroundPhotoStore();
    const photo = await store.add(jpeg(1), 1000);

    await store.remove(photo.id);

    expect(await store.list()).toEqual([]);
    expect(await store.get(photo.id)).toBeNull();
  });

  it("크기·위치 조정값을 고쳐 저장한다", async () => {
    const store = createTimerBackgroundPhotoStore();
    const photo = await store.add(jpeg(1), 1000);

    await store.updateFit(photo.id, { scale: 2, x: 10, y: 80 });

    expect((await store.get(photo.id))?.fit).toEqual({ scale: 2, x: 10, y: 80 });
  });
});
