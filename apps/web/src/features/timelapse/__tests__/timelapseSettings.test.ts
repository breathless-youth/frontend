import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TIMELAPSE_SETTINGS,
  createMemoryTimelapseSettingsStore,
  loadTimelapseSettings,
  parseTimelapseSettings,
  resetTimelapseSettingsStore,
  saveTimelapseSettings,
  setTimelapseSettingsStore,
} from "../timelapseSettings";

const KEY = "focuson.timelapse.v1";

describe("parseTimelapseSettings", () => {
  it("객체가 아니면 기본값", () => {
    expect(parseTimelapseSettings(null)).toEqual(DEFAULT_TIMELAPSE_SETTINGS);
    expect(parseTimelapseSettings([])).toEqual(DEFAULT_TIMELAPSE_SETTINGS);
    expect(parseTimelapseSettings("x")).toEqual(DEFAULT_TIMELAPSE_SETTINGS);
  });

  it("모르는 비율과 불리언이 아닌 값은 그 항목만 기본값으로 돌린다", () => {
    expect(
      parseTimelapseSettings({
        enabled: "yes",
        aspect: "4:3",
        info: { faceMask: true, date: 1, extra: true },
      }),
    ).toEqual({
      ...DEFAULT_TIMELAPSE_SETTINGS,
      info: { ...DEFAULT_TIMELAPSE_SETTINGS.info, faceMask: true },
    });
  });

  it("info가 없으면 정보 항목은 모두 꺼짐", () => {
    expect(parseTimelapseSettings({ enabled: false, aspect: "16:9" })).toEqual({
      ...DEFAULT_TIMELAPSE_SETTINGS,
      enabled: false,
      aspect: "16:9",
    });
  });
});

afterEach(() => {
  resetTimelapseSettingsStore();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("loadTimelapseSettings", () => {
  it("저장값이 없으면 저장 켬, 세로, 정보 항목 모두 꺼짐", async () => {
    await expect(loadTimelapseSettings()).resolves.toEqual({
      enabled: true,
      aspect: "9:16",
      info: {
        faceMask: false,
        flowBar: false,
        date: false,
        focusTime: false,
        focusRate: false,
        dday: false,
        streak: false,
      },
    });
  });

  it("저장한 값을 같은 키에서 그대로 복원한다", async () => {
    const settings = {
      enabled: false,
      aspect: "16:9" as const,
      info: { ...DEFAULT_TIMELAPSE_SETTINGS.info, faceMask: true, streak: true },
    };
    await saveTimelapseSettings(settings);

    expect(JSON.parse(localStorage.getItem(KEY) ?? "null")).toEqual(settings);
    await expect(loadTimelapseSettings()).resolves.toEqual(settings);
  });

  it("깨진 JSON이면 기본값", async () => {
    localStorage.setItem(KEY, "{not json");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(loadTimelapseSettings()).resolves.toEqual(DEFAULT_TIMELAPSE_SETTINGS);
  });

  it("접근 자체가 throw 해도 기본값으로 떨어진다", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(loadTimelapseSettings()).resolves.toEqual(DEFAULT_TIMELAPSE_SETTINGS);
  });

  it("저장이 throw 해도 reject 하지 않는다", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(saveTimelapseSettings(DEFAULT_TIMELAPSE_SETTINGS)).resolves.toBeUndefined();
  });

  it("교체한 메모리 저장소를 쓰고 localStorage는 건드리지 않는다", async () => {
    setTimelapseSettingsStore(
      createMemoryTimelapseSettingsStore({ ...DEFAULT_TIMELAPSE_SETTINGS, enabled: false }),
    );
    await expect(loadTimelapseSettings()).resolves.toMatchObject({ enabled: false });
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
