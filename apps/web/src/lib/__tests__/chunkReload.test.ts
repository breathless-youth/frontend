import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RELOAD_AT_KEY,
  RELOAD_GUARD_MS,
  reloadOnceAfterChunkError,
  reloadOnChunkError,
} from "../chunkReload";

const reload = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  sessionStorage.clear();
  reload.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("reloadOnceAfterChunkError", () => {
  it("첫 실패에는 새로고침하고 시각을 남긴다", () => {
    expect(reloadOnceAfterChunkError(reload)).toBe(true);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(RELOAD_AT_KEY)).toBe(String(Date.now()));
  });

  it("10초 안에 다시 실패하면 새로고침하지 않는다", () => {
    sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now() - RELOAD_GUARD_MS + 1));

    expect(reloadOnceAfterChunkError(reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("10초가 지난 뒤의 실패에는 다시 새로고침한다", () => {
    sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now() - RELOAD_GUARD_MS));

    expect(reloadOnceAfterChunkError(reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("sessionStorage를 쓸 수 없으면 새로고침하지 않는다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(reloadOnceAfterChunkError(reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("reloadOnChunkError", () => {
  it("로드가 실패하고 새로고침하면 끝나지 않는 promise를 돌려준다", async () => {
    const load = reloadOnChunkError(() => Promise.reject(new Error("chunk load failed")), reload);
    const settled = vi.fn();

    void load().then(settled, settled);
    await vi.advanceTimersByTimeAsync(RELOAD_GUARD_MS);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
  });

  it("10초 안에 다시 실패하면 원래 오류를 던진다", async () => {
    sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
    const error = new Error("chunk load failed");
    const load = reloadOnChunkError(() => Promise.reject(error), reload);

    await expect(load()).rejects.toBe(error);
    expect(reload).not.toHaveBeenCalled();
  });
});
