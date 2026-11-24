import { afterEach, describe, expect, it, vi } from "vitest";

import { createAmbientUsage } from "@/features/ambient-sound/ambientUsage";

import { createFocusFeatureUsage } from "../focusFeatureUsage";

const STARTED_AT_MS = 1_800_000_000_000;

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("집중 기능 사용 기록", () => {
  it("재생한 공부를 복원하면 소리를 다시 재생하지 않아도 사용 기록이 이어진다", () => {
    const usage = createFocusFeatureUsage();
    usage.bindSession(7, STARTED_AT_MS);
    const ambient = createAmbientUsage(() => STARTED_AT_MS, usage.markUsed);

    expect(usage.hasUsed()).toBe(false);
    ambient.start();
    ambient.stop();

    const restored = createFocusFeatureUsage();
    restored.bindSession(7, STARTED_AT_MS);
    expect(restored.hasUsed()).toBe(true);
  });

  it.each([
    { userId: 8, startedAtMs: STARTED_AT_MS },
    { userId: 7, startedAtMs: STARTED_AT_MS + 1_000 },
  ])("다른 계정이나 새 공부에는 사용 기록을 적용하지 않는다", ({ userId, startedAtMs }) => {
    const usage = createFocusFeatureUsage();
    usage.bindSession(7, STARTED_AT_MS);
    usage.markUsed();

    usage.bindSession(userId, startedAtMs);
    expect(usage.hasUsed()).toBe(false);
  });

  it("저장소를 사용할 수 없어도 현재 공부의 사용 기록을 남긴다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const usage = createFocusFeatureUsage();
    usage.bindSession(7, STARTED_AT_MS);
    usage.markUsed();

    expect(usage.hasUsed()).toBe(true);
  });
});
