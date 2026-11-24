import { afterEach, describe, expect, it } from "vitest";

import { loadSessionBannerGroup, saveSessionBannerGroup } from "../sessionBannerStore";

afterEach(() => {
  localStorage.clear();
});

describe("sessionBannerStore", () => {
  it("저장한 군을 다시 읽는다", () => {
    saveSessionBannerGroup(7, "control");
    expect(loadSessionBannerGroup(7)).toBe("control");
  });

  it("저장값이 깨졌으면 null이다", () => {
    localStorage.setItem("focusmakers.sessionBanner.v1.7", "{oops");
    expect(loadSessionBannerGroup(7)).toBeNull();
    localStorage.setItem("focusmakers.sessionBanner.v1.7", JSON.stringify("winner"));
    expect(loadSessionBannerGroup(7)).toBeNull();
  });
});
