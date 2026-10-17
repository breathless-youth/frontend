import { afterEach, expect, it, vi } from "vitest";

import { readAppLockEnabled, writeAppLockEnabled } from "../appLockSettings";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

it("처음에는 꺼져 있고 쓴 값을 다시 읽는다", () => {
  expect(readAppLockEnabled()).toBe(false);
  writeAppLockEnabled(true);
  expect(readAppLockEnabled()).toBe(true);
  writeAppLockEnabled(false);
  expect(readAppLockEnabled()).toBe(false);
});

it("저장소가 던지면 꺼진 것으로 읽고 쓰기는 삼킨다", () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(readAppLockEnabled()).toBe(false);
  expect(() => writeAppLockEnabled(true)).not.toThrow();
});
