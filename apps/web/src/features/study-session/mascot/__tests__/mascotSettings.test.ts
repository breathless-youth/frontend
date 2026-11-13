import { afterEach, describe, expect, it, vi } from "vitest";

import { readSessionMascotOn, writeSessionMascotOn } from "../mascotSettings";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("mascotSettings", () => {
  it("저장한 값이 없으면 켜짐이다", () => {
    expect(readSessionMascotOn()).toBe(true);
  });
  it("끈 값을 저장하면 꺼짐으로 읽는다", () => {
    writeSessionMascotOn(false);
    expect(localStorage.getItem("focuson.sessionMascot.v1")).toBe("off");
    expect(readSessionMascotOn()).toBe(false);
    writeSessionMascotOn(true);
    expect(readSessionMascotOn()).toBe(true);
  });
  it("저장소를 읽을 수 없으면 켜짐으로 본다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readSessionMascotOn()).toBe(true);
  });
  it("저장소에 쓸 수 없어도 throw하지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeSessionMascotOn(false)).not.toThrow();
  });
});
