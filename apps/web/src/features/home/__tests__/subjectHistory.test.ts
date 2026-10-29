import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hasCreatedSubject, markSubjectCreated } from "../subjectHistory";

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
