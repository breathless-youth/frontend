import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";

/**
 * `App` 전체 렌더는 홈 탭의 통계 쿼리(`useHomeSummary`)가 실 `fetch`를 태운다 — 스텁이
 * 없으면 jsdom이 실 네트워크를 타고, 모듈 스코프 `queryClient`의 retry 타이머가 테스트
 * 종료 후에도 남아 플레이크 소지가 된다. 404로 즉시 응답해 타이머를 짧게 끝낸다
 * (data-testid 검증은 쿼리 성공 여부와 무관하므로 응답 내용은 중요하지 않다).
 */
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("탭 라우트 골격", () => {
  it("/home 이 홈 골격을 띄운다", () => {
    renderAt("/home?userId=7");
    expect(screen.getByTestId("home-tab-page")).toBeInTheDocument();
  });

  it("/records 가 기록 골격을 띄운다", () => {
    renderAt("/records");
    expect(screen.getByTestId("records-page")).toBeInTheDocument();
  });

  it("/settings 가 설정 골격을 띄운다", () => {
    renderAt("/settings");
    expect(screen.getByTestId("settings-page")).toBeInTheDocument();
  });

  it("/home?userId=7 에서는 userId 없음 문구가 보이지 않는다", () => {
    renderAt("/home?userId=7");
    expect(screen.queryByText(/userId 없음/)).not.toBeInTheDocument();
  });

  it("/home 에 userId 없이 접속하면 userId 없음 문구가 보인다", () => {
    renderAt("/home");
    expect(screen.getByText(/userId 없음/)).toBeInTheDocument();
  });
});
