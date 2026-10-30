import { afterEach, describe, expect, it } from "vitest";

import { __resetTabBarPlayForTests, hasTabBarPlayButton } from "../tabBarPlayCapability";

afterEach(() => {
  window.history.replaceState(null, "", "/");
  __resetTabBarPlayForTests();
});

describe("hasTabBarPlayButton", () => {
  it("앱이 URL에 tabBarPlay=1을 붙였으면 참이다", () => {
    window.history.replaceState(null, "", "/home?tabBarPlay=1");
    __resetTabBarPlayForTests();

    expect(hasTabBarPlayButton()).toBe(true);
  });

  it("표시가 없으면 거짓이다", () => {
    window.history.replaceState(null, "", "/home?userId=7");
    __resetTabBarPlayForTests();

    expect(hasTabBarPlayButton()).toBe(false);
  });

  it("한 번 읽은 뒤 앱 안 이동으로 쿼리가 사라져도 그대로다", () => {
    window.history.replaceState(null, "", "/home?tabBarPlay=1");
    __resetTabBarPlayForTests();
    hasTabBarPlayButton();
    window.history.replaceState(null, "", "/records");

    expect(hasTabBarPlayButton()).toBe(true);
  });
});
