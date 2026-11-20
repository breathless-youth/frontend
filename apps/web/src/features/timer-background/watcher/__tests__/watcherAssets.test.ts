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
import { watchClipUrl } from "../../spaceFiles";

const KEY = "watcher/9c8d9f19";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  __resetWatcherAssetsForTests();
});

const ok = (body: string) =>
  Promise.resolve(new Response(body, { headers: { "content-type": "video/mp4" } }));

describe("watcherAssets", () => {
  it("휴대폰은 휴대폰 영상만 세로·가로 모두 담고 소리를 더한다", () => {
    const urls = watcherAssetUrls(KEY, { width: 390, height: 844 });
    expect(urls).toHaveLength(13);
    expect(urls.filter((url) => url.endsWith(".mp4"))).toHaveLength(8);
    expect(urls.some((url) => url.includes("tablet"))).toBe(false);
    expect(urls).toContain(`/spaces/${KEY}/enter/phone_landscape.mp4`);
    expect(urls).toContain(`/spaces/${KEY}/sound/approach.m4a`);
  });

  it("받은 파일은 다시 받지 않고, 못 받은 파일은 건너뛰며, 지우면 없어진다", async () => {
    const a = watchClipUrl(KEY, "enter", "phone_portrait");
    const b = watchClipUrl(KEY, "exit", "phone_portrait");
    const load = vi.fn((url: string) =>
      url === b ? Promise.reject(new Error("offline")) : ok("enter"),
    );

    await saveWatcherAssets(KEY, [a, b], load);
    await saveWatcherAssets(KEY, [a, b], load);

    expect(load.mock.calls.map(([url]) => url)).toEqual([a, b, b]);
    const stored = (await readWatcherAsset(a)) as Blob | null;
    expect(stored?.type).toBe("video/mp4");
    expect(stored?.size).toBe("enter".length);
    expect(await readWatcherAsset(b)).toBeNull();

    await clearWatcherAssets();
    expect(await readWatcherAsset(a)).toBeNull();
  });

  it("다른 공간을 받으면 앞 공간의 파일을 지운다", async () => {
    const old = watchClipUrl("watcher/00000000", "enter", "phone_portrait");
    await saveWatcherAssets("watcher/00000000", [old], () => ok("old"));
    expect(await readWatcherAsset(old)).not.toBeNull();

    await saveWatcherAssets(KEY, [], () => ok("new"));

    expect(await readWatcherAsset(old)).toBeNull();
  });

  it("받는 중에 지우면 늦게 끝난 파일을 저장하지 않는다", async () => {
    const url = watchClipUrl(KEY, "enter", "phone_portrait");
    let finish: (response: Response) => void = () => {};
    let started = false;
    const saving = saveWatcherAssets(KEY, [url], () => {
      started = true;
      return new Promise((resolve) => (finish = resolve));
    });
    await vi.waitFor(() => expect(started).toBe(true));

    await clearWatcherAssets();
    finish(new Response("late", { headers: { "content-type": "video/mp4" } }));
    await saving;

    expect(await readWatcherAsset(url)).toBeNull();
  });

  it("loop-a가 403이면 없음으로 기록하고 다른 파일은 그대로 받는다", async () => {
    const loopA = watchClipUrl(KEY, "loop-a", "phone_portrait");
    const enter = watchClipUrl(KEY, "enter", "phone_portrait");

    await saveWatcherAssets(KEY, [loopA, enter], (url) =>
      url === loopA ? Promise.resolve(new Response(null, { status: 403 })) : ok("enter"),
    );

    expect(await readWatcherAsset(loopA)).toBe("missing");
    const stored = await readWatcherAsset(enter);
    expect(stored).not.toBeNull();
    expect(stored).not.toBe("missing");
  });

  it("loop-a가 아닌 파일이 403이면 기록하지 않아 다음에 다시 받는다", async () => {
    const exit = watchClipUrl(KEY, "exit", "phone_portrait");
    const load = vi.fn(() => Promise.resolve(new Response(null, { status: 403 })));

    await saveWatcherAssets(KEY, [exit], load);
    await saveWatcherAssets(KEY, [exit], load);

    expect(await readWatcherAsset(exit)).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
