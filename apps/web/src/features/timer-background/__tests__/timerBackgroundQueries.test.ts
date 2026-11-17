import "fake-indexeddb/auto";

import { QueryClient } from "@tanstack/react-query";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jpegDataUrl } from "@/lib/jpegDataUrl";

import {
  __resetTimerBackgroundPhotoStoreForTests,
  timerBackgroundPhotoStore,
} from "../timerBackgroundPhotos";
import { timerBackgroundPhotoQuery, timerBackgroundPhotosQuery } from "../timerBackgroundQueries";

const ORIGINAL = new Uint8Array([1, 2, 3, 4]);
const THUMB = new Uint8Array([9, 9]);
const drawImage = vi.fn();

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  __resetTimerBackgroundPhotoStoreForTests();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ drawImage }) as never,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    const blob = new Blob([THUMB], { type: "image/jpeg" });
    // jsdom의 Blob에는 arrayBuffer가 없어 직접 단다.
    Object.defineProperty(blob, "arrayBuffer", { value: async () => THUMB.slice().buffer });
    callback(blob);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  drawImage.mockClear();
});

async function addPhoto() {
  return timerBackgroundPhotoStore().add(
    { bytes: ORIGINAL.slice().buffer, width: 1920, height: 1440 },
    1,
  );
}

describe("타이머 배경 사진 조회", () => {
  it("선택 화면 목록에는 원본 대신 긴 변 360px로 줄인 사진을 담는다", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 1920, height: 1440, close: vi.fn() })),
    );
    await addPhoto();

    const [tile] = await new QueryClient().fetchQuery(timerBackgroundPhotosQuery());

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 360, 270);
    expect(tile!.thumb).toBe(await jpegDataUrl(THUMB.slice().buffer));
  });

  it("줄이지 못하면 목록에도 원본을 쓴다", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("decode");
      }),
    );
    await addPhoto();

    const [tile] = await new QueryClient().fetchQuery(timerBackgroundPhotosQuery());

    expect(tile!.thumb).toBe(await jpegDataUrl(ORIGINAL.slice().buffer));
  });

  it("미리보기에 쓰는 한 장은 원본을 담는다", async () => {
    const saved = await addPhoto();

    const view = await new QueryClient().fetchQuery(timerBackgroundPhotoQuery(saved.id));

    expect(view?.src).toBe(await jpegDataUrl(ORIGINAL.slice().buffer));
  });
});
