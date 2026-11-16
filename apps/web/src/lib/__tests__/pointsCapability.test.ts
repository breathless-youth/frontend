import { afterEach, describe, expect, it, vi } from "vitest";

import { __resetPointsForTests, isPointsEnabled } from "@/lib/pointsCapability";

function openAt(search: string) {
  window.history.replaceState(null, "", `/home${search}`);
  __resetPointsForTests();
}

afterEach(() => {
  vi.unstubAllEnvs();
  openAt("");
});

describe("isPointsEnabled", () => {
  it("앱이 주소에 points=1 표시를 붙였을 때만 켜진다", () => {
    openAt("");
    expect(isPointsEnabled()).toBe(false);
    openAt("?points=0");
    expect(isPointsEnabled()).toBe(false);
    openAt("?points=1");
    expect(isPointsEnabled()).toBe(true);
  });

  it("앱 안에서 이동해 주소에서 표시가 빠져도 처음 읽은 값을 쓴다", () => {
    openAt("?points=1");
    expect(isPointsEnabled()).toBe(true);
    window.history.replaceState(null, "", "/settings");
    expect(isPointsEnabled()).toBe(true);
  });

  it("개발 서버에서는 표시 없이도 켜진다", () => {
    vi.stubEnv("MODE", "development");
    openAt("");
    expect(isPointsEnabled()).toBe(true);
  });

  it("끄는 스위치가 켜진 빌드에서는 표시가 있어도 꺼진다", () => {
    vi.stubEnv("VITE_POINTS_DISABLED", "1");
    openAt("?points=1");
    expect(isPointsEnabled()).toBe(false);
  });

  it("끄는 스위치가 켜진 빌드에서는 개발 서버에서도 꺼진다", () => {
    vi.stubEnv("VITE_POINTS_DISABLED", "1");
    vi.stubEnv("MODE", "development");
    openAt("");
    expect(isPointsEnabled()).toBe(false);
  });

  it("스위치 값이 1이 아니면 끄지 않는다", () => {
    vi.stubEnv("VITE_POINTS_DISABLED", "0");
    openAt("?points=1");
    expect(isPointsEnabled()).toBe(true);
  });
});
