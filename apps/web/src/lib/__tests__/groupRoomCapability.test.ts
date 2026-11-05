import { afterEach, describe, expect, it, vi } from "vitest";

import { __resetGroupRoomsForTests, hasGroupRooms } from "@/lib/groupRoomCapability";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.replaceState(null, "", "/");
  __resetGroupRoomsForTests();
});

function open(path: string, bridge: boolean): void {
  if (bridge) vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
  window.history.replaceState(null, "", path);
  __resetGroupRoomsForTests();
}

describe("hasGroupRooms", () => {
  it("셸이 groupRooms=1을 실었을 때만 참이다", () => {
    open("/social?groupRooms=1", true);
    expect(hasGroupRooms()).toBe(true);
    open("/social", true);
    expect(hasGroupRooms()).toBe(false);
  });

  it("브라우저도 같은 표시로 켜진다", () => {
    open("/social?groupRooms=1", false);
    expect(hasGroupRooms()).toBe(true);
    open("/social", false);
    expect(hasGroupRooms()).toBe(false);
  });

  it("앱 안 이동으로 쿼리가 사라져도 판정을 지킨다", () => {
    open("/social?groupRooms=1", true);
    expect(hasGroupRooms()).toBe(true);
    window.history.replaceState(null, "", "/social/groups/10");
    expect(hasGroupRooms()).toBe(true);
  });

  it("개발 서버에서는 표시가 없어도 참이다", () => {
    vi.stubEnv("MODE", "development");
    open("/social", true);
    expect(hasGroupRooms()).toBe(true);
  });

  // `vite build --mode development`는 MODE만 development이고 DEV는 거짓인 배포 빌드다.
  it("MODE가 development여도 개발 빌드가 아니면 표시를 따른다", () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("DEV", false);
    open("/social", true);
    expect(hasGroupRooms()).toBe(false);
    open("/social?groupRooms=1", true);
    expect(hasGroupRooms()).toBe(true);
  });
});
