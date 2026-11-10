import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetWatcherAssetsForTests,
  clearWatcherAssets,
  readWatcherAsset,
  saveWatcherAssets,
  watcherAssetUrls,
} from "../watcherAssets";
import { WATCHER_ASSET_DIR } from "../watcherClips";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  __resetWatcherAssetsForTests();
});

const ok = (body: string) =>
  Promise.resolve(new Response(body, { headers: { "content-type": "video/mp4" } }));

describe("watcherAssets", () => {
  it("휴대폰은 휴대폰 영상만 세로·가로 모두 담고 소리를 더한다", () => {
    const urls = watcherAssetUrls({ width: 390, height: 844 });
    expect(urls).toHaveLength(13);
    expect(urls.filter((url) => url.endsWith(".mp4"))).toHaveLength(8);
    expect(urls.some((url) => url.includes("tablet"))).toBe(false);
    expect(urls).toContain(`${WATCHER_ASSET_DIR}/enter/phone_landscape.mp4`);
    expect(urls).toContain(`${WATCHER_ASSET_DIR}/sound/approach.m4a`);
  });

  it("받은 파일은 다시 받지 않고, 못 받은 파일은 건너뛰며, 지우면 없어진다", async () => {
    const a = `${WATCHER_ASSET_DIR}/enter/phone_portrait.mp4`;
    const b = `${WATCHER_ASSET_DIR}/exit/phone_portrait.mp4`;
    const load = vi.fn((url: string) =>
      url === b ? Promise.reject(new Error("offline")) : ok("enter"),
    );

    await saveWatcherAssets([a, b], load);
    await saveWatcherAssets([a, b], load);

    expect(load.mock.calls.map(([url]) => url)).toEqual([a, b, b]);
    const stored = await readWatcherAsset(a);
    expect(stored?.type).toBe("video/mp4");
    expect(stored?.size).toBe("enter".length);
    expect(await readWatcherAsset(b)).toBeNull();

    await clearWatcherAssets();
    expect(await readWatcherAsset(a)).toBeNull();
  });

  it("소재 폴더가 바뀌면 옛 폴더 파일을 지운다", async () => {
    const old = "/watcher/00000000/enter/phone_portrait.mp4";
    await saveWatcherAssets([old], () => ok("old"));
    expect(await readWatcherAsset(old)).not.toBeNull();

    await saveWatcherAssets([], () => ok("new"));

    expect(await readWatcherAsset(old)).toBeNull();
  });
});
