import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })),
  );
  // 넓은 브라우저 창
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: query.includes("min-width"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App PC 셸 라우트", () => {
  it("넓은 브라우저에서 일반 하위 화면은 상단 바 안에 그린다", async () => {
    renderAt("/terms");

    expect(await screen.findByRole("banner")).toBeInTheDocument();
  });

  it("로그인처럼 화면 전체를 쓰는 흐름은 상단 바 없이 그린다", async () => {
    renderAt("/settings/login");

    expect(await screen.findByRole("main")).toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });

  it("앱 웹뷰는 창이 넓어도 상단 바 없이 지금 화면을 그린다", async () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });

    renderAt("/terms");

    expect((await screen.findAllByRole("heading")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });
});
