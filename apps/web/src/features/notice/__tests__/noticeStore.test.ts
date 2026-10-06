import { afterEach, describe, expect, it, vi } from "vitest";

import {
  hasShownNoticeThisLaunch,
  isNoticeDismissed,
  markNoticeDismissed,
  markNoticeShownThisLaunch,
} from "../noticeStore";

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("공지 다시 보지 않기", () => {
  it("기록 전에는 false, 기록 후에는 true다", () => {
    expect(isNoticeDismissed(3)).toBe(false);
    markNoticeDismissed(3);
    expect(localStorage.getItem("focuson.noticeDismissed.3")).toBe("1");
    expect(isNoticeDismissed(3)).toBe(true);
  });
  it("읽기가 실패하면 true다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(isNoticeDismissed(3)).toBe(true);
  });
});

describe("이번 실행 표시 여부", () => {
  it("sessionStorage에 남아 문서를 다시 열어도 유지된다", () => {
    expect(hasShownNoticeThisLaunch()).toBe(false);
    markNoticeShownThisLaunch();
    expect(sessionStorage.getItem("focuson.notice.shownThisLaunch")).toBe("1");
    expect(hasShownNoticeThisLaunch()).toBe(true);
  });
  it("읽기가 실패하면 true다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(hasShownNoticeThisLaunch()).toBe(true);
  });
});
