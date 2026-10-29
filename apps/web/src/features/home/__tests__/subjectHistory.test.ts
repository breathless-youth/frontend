import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hasCreatedSubject, homeEmptyKind, markSubjectCreated } from "../subjectHistory";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("과목을 만든 적 있음 기록", () => {
  it("계정마다 따로 남는다", () => {
    markSubjectCreated(7);

    expect(hasCreatedSubject(7)).toBe(true);
    expect(hasCreatedSubject(8)).toBe(false);
  });

  it("저장소를 읽지 못하면 만든 적 없는 것으로 본다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(hasCreatedSubject(7)).toBe(false);
  });

  it("저장소에 쓰지 못해도 던지지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => markSubjectCreated(7)).not.toThrow();
  });
});

describe("homeEmptyKind", () => {
  it("과목이 0개이고 만든 적이 없으면 환영 화면이다", () => {
    expect(homeEmptyKind(0, false)).toBe("welcome");
  });

  it("과목이 0개여도 만든 적이 있으면 빈 화면이다", () => {
    expect(homeEmptyKind(0, true)).toBe("empty");
  });

  it("과목이 있으면 목록이다", () => {
    expect(homeEmptyKind(2, false)).toBe("list");
  });

  it("저장소에 쓰지 않는다", () => {
    homeEmptyKind(2, false);

    expect(localStorage.length).toBe(0);
  });
});
