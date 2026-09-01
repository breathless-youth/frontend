import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReportScreenMessage } from "@focusmakers/types";

import { useNativeScreenReport } from "@/lib/nativeScreenReport";

function Harness() {
  useNativeScreenReport();
  return null;
}

function renderAt(entry: { pathname: string; search?: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Harness />
    </MemoryRouter>,
  );
}

function lastReport(postMessage: ReturnType<typeof vi.fn>): ReportScreenMessage {
  const raw = postMessage.mock.calls.at(-1)![0] as string;
  return JSON.parse(raw) as ReportScreenMessage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useNativeScreenReport", () => {
  it("일반 화면은 경로와 dark:false를 보고한다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    renderAt({ pathname: "/social", search: "?userId=7" });

    const report = lastReport(postMessage);
    expect(report.type).toBe("report-screen");
    expect(report.path).toBe("/social");
    expect(report.dark).toBe(false);
    expect(report.restoreQuery).toBeUndefined();
  });

  it("소셜룸은 dark:true에 router state의 초대코드를 복원 쿼리로 싣는다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    renderAt({
      pathname: "/social/room/42",
      search: "?userId=7",
      state: { inviteCode: "0712" },
    });

    const report = lastReport(postMessage);
    expect(report.path).toBe("/social/room/42");
    expect(report.dark).toBe(true);
    expect(report.restoreQuery).toEqual({ code: "0712" });
  });

  it("소셜룸에 state가 없으면 ?code 쿼리를 복원 쿼리로 쓴다 — 복원된 문서의 재보고", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    renderAt({ pathname: "/social/room/42", search: "?userId=7&code=0712" });

    expect(lastReport(postMessage).restoreQuery).toEqual({ code: "0712" });
  });

  it("온보딩 가이드는 entry 쿼리를 복원 쿼리로 보존한다 — 유실되면 완료가 세션을 시작하지 않는다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    renderAt({ pathname: "/onboarding-guide", search: "?userId=7&entry=focus-start" });

    expect(lastReport(postMessage).restoreQuery).toEqual({ entry: "focus-start" });
  });

  it("entry 없는 온보딩 가이드는 복원 쿼리도 없다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    renderAt({ pathname: "/onboarding-guide", search: "?userId=7" });

    expect(lastReport(postMessage).restoreQuery).toBeUndefined();
  });

  it("싱글룸 세션도 dark:true다 — 복원 쿼리는 없다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    renderAt({ pathname: "/room/9", search: "?userId=7" });

    const report = lastReport(postMessage);
    expect(report.dark).toBe(true);
    expect(report.restoreQuery).toBeUndefined();
  });

  it("세션 결과 화면은 dark:false다 — 일반 테마 화면이다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    renderAt({ pathname: "/room/9/result", search: "?userId=7" });

    expect(lastReport(postMessage).dark).toBe(false);
  });

  it("소셜룸 결과 화면도 dark:false다 — 룸이 아니라 일반 테마 결과 화면이다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    renderAt({ pathname: "/social/room/42/result", search: "?userId=7" });

    expect(lastReport(postMessage).dark).toBe(false);
  });
});
