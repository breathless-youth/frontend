import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_AMBIENT_SETTINGS,
  createMemoryAmbientSoundStore,
  loadAmbientSoundSettings,
  parseAmbientSettings,
  resetAmbientSoundStore,
  saveAmbientSoundSettings,
  setAmbientSoundStore,
} from "../ambientSoundStore";

const KEY = "focuson.ambientSound.v1";

afterEach(() => {
  resetAmbientSoundStore();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("loadAmbientSoundSettings", () => {
  it("저장값이 없으면 기본값", async () => {
    await expect(loadAmbientSoundSettings()).resolves.toEqual({
      mix: {},
      duckEnabled: true,
    });
  });

  it("저장한 값을 같은 키에서 그대로 복원한다", async () => {
    const settings = {
      mix: { white: 60, rain: 40 },
      duckEnabled: false,
    };
    await saveAmbientSoundSettings(settings);

    expect(JSON.parse(localStorage.getItem(KEY) ?? "null")).toEqual(settings);
    await expect(loadAmbientSoundSettings()).resolves.toEqual(settings);
  });

  it("깨진 JSON 이면 기본값", async () => {
    localStorage.setItem(KEY, "{not json");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(loadAmbientSoundSettings()).resolves.toEqual(DEFAULT_AMBIENT_SETTINGS);
  });

  it("접근 자체가 throw 해도 기본값으로 떨어지고 예외를 내지 않는다", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(loadAmbientSoundSettings()).resolves.toEqual(DEFAULT_AMBIENT_SETTINGS);
  });

  it("저장이 throw 해도 reject 하지 않는다", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(saveAmbientSoundSettings(DEFAULT_AMBIENT_SETTINGS)).resolves.toBeUndefined();
  });

  it("교체한 메모리 저장소를 쓰고 localStorage 는 건드리지 않는다", async () => {
    setAmbientSoundStore(
      createMemoryAmbientSoundStore({ ...DEFAULT_AMBIENT_SETTINGS, duckEnabled: false }),
    );
    await expect(loadAmbientSoundSettings()).resolves.toMatchObject({ duckEnabled: false });
    await saveAmbientSoundSettings({ ...DEFAULT_AMBIENT_SETTINGS, mix: { white: 10 } });
    await expect(loadAmbientSoundSettings()).resolves.toMatchObject({ mix: { white: 10 } });
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe("parseAmbientSettings", () => {
  it("객체가 아니면 기본값", () => {
    expect(parseAmbientSettings(null)).toEqual(DEFAULT_AMBIENT_SETTINGS);
    expect(parseAmbientSettings([])).toEqual(DEFAULT_AMBIENT_SETTINGS);
    expect(parseAmbientSettings("x")).toEqual(DEFAULT_AMBIENT_SETTINGS);
  });

  it("필드가 빠지거나 타입이 다르면 그 필드만 기본값", () => {
    expect(parseAmbientSettings({ mix: [1], duckEnabled: "no" })).toEqual(DEFAULT_AMBIENT_SETTINGS);
    expect(parseAmbientSettings({ duckEnabled: false })).toEqual({
      mix: {},
      duckEnabled: false,
    });
  });

  it("레벨이 숫자가 아니거나 0 이하면 그 소리만 지우고 범위 밖은 자른다", () => {
    expect(
      parseAmbientSettings({ mix: { white: "60", pink: 0, brown: -3, rain: 150, cafe: 30 } }),
    ).toMatchObject({ mix: { rain: 100, cafe: 30 } });
  });

  /** 겹쳐 켜는 개수에 상한이 없다. 저장값을 앞에서 자르던 규칙이 되살아나면 여기서 잡는다. */
  it("믹스에 여럿 들어 있어도 전부 살린다", () => {
    expect(parseAmbientSettings({ mix: { a: 1, b: 2, c: 3, d: 4 } }).mix).toEqual({
      a: 1,
      b: 2,
      c: 3,
      d: 4,
    });
  });

  /** 조합 저장을 걷어냈다. 예전 저장값에 남아 있어도 무시하고 흘려보낸다. */
  it("예전에 저장한 프리셋이 남아 있어도 무시한다", () => {
    expect(
      parseAmbientSettings({
        mix: { white: 60 },
        presets: [{ id: "p1", name: "a", mix: { rain: 20 } }],
      }),
    ).toEqual({ mix: { white: 60 }, duckEnabled: true });
  });
});
