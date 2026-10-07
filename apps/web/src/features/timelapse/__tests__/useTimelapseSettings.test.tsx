import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_TIMELAPSE_SETTINGS,
  createMemoryTimelapseSettingsStore,
  resetTimelapseSettingsStore,
  setTimelapseSettingsStore,
} from "../timelapseSettings";
import { useTimelapseSettings } from "../useTimelapseSettings";

afterEach(() => {
  resetTimelapseSettingsStore();
});

describe("useTimelapseSettings", () => {
  it("읽기 전에는 null이고 읽은 뒤에는 저장값을 준다", async () => {
    const saved = { ...DEFAULT_TIMELAPSE_SETTINGS, aspect: "16:9" as const };
    setTimelapseSettingsStore(createMemoryTimelapseSettingsStore(saved));

    const { result } = renderHook(() => useTimelapseSettings());

    expect(result.current[0]).toBeNull();
    await waitFor(() => expect(result.current[0]).toEqual(saved));
  });

  it("바꾸면 화면 값이 바로 바뀌고 저장소에도 남는다", async () => {
    const store = createMemoryTimelapseSettingsStore();
    setTimelapseSettingsStore(store);
    const { result } = renderHook(() => useTimelapseSettings());
    await waitFor(() => expect(result.current[0]).not.toBeNull());
    const next = { ...DEFAULT_TIMELAPSE_SETTINGS, enabled: false };

    act(() => result.current[1](next));

    expect(result.current[0]).toEqual(next);
    await expect(store.load()).resolves.toEqual(next);
  });
});
