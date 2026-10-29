import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  START_SUBJECT_TTL_MS,
  clearStartSubject,
  readStartSubject,
  saveStartSubject,
} from "../startSubject";

const KEY = "focusmakers:start-subject";
const AT = Date.UTC(2026, 9, 29, 1, 0, 0);

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("시작 과목 기록", () => {
  it("남긴 기록을 그대로 읽는다", () => {
    saveStartSubject(7, 3, AT);

    expect(readStartSubject(AT + 1_000)).toEqual({ userId: 7, subjectId: 3, atMs: AT });
  });

  it("읽기만으로는 삭제되지 않고, 삭제하면 사라진다", () => {
    saveStartSubject(7, 3, AT);
    readStartSubject(AT);
    expect(localStorage.getItem(KEY)).not.toBeNull();

    clearStartSubject();
    expect(readStartSubject(AT)).toBeNull();
  });

  it("30초까지는 쓰고 그 뒤에는 버린다", () => {
    saveStartSubject(7, 3, AT);

    expect(readStartSubject(AT + START_SUBJECT_TTL_MS)).not.toBeNull();
    expect(readStartSubject(AT + START_SUBJECT_TTL_MS + 1)).toBeNull();
  });

  it("남긴 시각이 읽는 시각보다 뒤면 버린다", () => {
    saveStartSubject(7, 3, AT);

    expect(readStartSubject(AT - 1)).toBeNull();
  });

  it.each([
    ["JSON이 아니다", "not-json"],
    ["과목이 없다", JSON.stringify({ userId: 7, atMs: AT })],
    ["과목이 정수가 아니다", JSON.stringify({ userId: 7, subjectId: "3", atMs: AT })],
    ["신원이 정수가 아니다", JSON.stringify({ userId: 7.5, subjectId: 3, atMs: AT })],
    ["시각이 숫자가 아니다", JSON.stringify({ userId: 7, subjectId: 3, atMs: "now" })],
    ["null이다", "null"],
  ])("형식이 틀리면 버린다: %s", (_label, raw) => {
    localStorage.setItem(KEY, raw);

    expect(readStartSubject(AT)).toBeNull();
  });

  it("저장소를 쓸 수 없어도 throw하지 않는다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => saveStartSubject(7, 3, AT)).not.toThrow();
    expect(() => clearStartSubject()).not.toThrow();
    expect(readStartSubject(AT)).toBeNull();
  });
});
