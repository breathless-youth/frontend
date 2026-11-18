import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShellLayout } from "@/desktop/ShellLayout";
import { usePcShell } from "@/desktop/usePcShell";

/**
 * 창 폭을 흉내 내는 matchMedia
 *
 * 쿼리의 `min-width`를 rem으로 읽어 지금 폭과 비교하므로, 기준 폭을 바꾸면 테스트가 깨진다.
 */
function stubViewport(initialWidth: number) {
  let width = initialWidth;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => {
    const rem = /min-width:\s*([\d.]+)rem/.exec(query);
    const min = rem ? Number(rem[1]) * 16 : Number.POSITIVE_INFINITY;
    return {
      media: query,
      get matches() {
        return width >= min;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };
  });
  return {
    resize(next: number) {
      width = next;
      act(() => {
        for (const listener of listeners) listener();
      });
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePcShell", () => {
  it("브라우저에서 창 폭이 1200이면 PC 셸이다", () => {
    stubViewport(1200);

    const { result } = renderHook(() => usePcShell());

    expect(result.current).toBe(true);
  });

  it("창 폭이 1199면 PC 셸이 아니다", () => {
    stubViewport(1199);

    const { result } = renderHook(() => usePcShell());

    expect(result.current).toBe(false);
  });

  it("앱 웹뷰(브리지 있음)에서는 1440이어도 PC 셸이 아니다", () => {
    stubViewport(1440);
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });

    const { result } = renderHook(() => usePcShell());

    expect(result.current).toBe(false);
  });

  it("matchMedia가 없는 환경은 모바일 화면으로 둔다", () => {
    vi.stubGlobal("matchMedia", undefined);

    const { result } = renderHook(() => usePcShell());

    expect(result.current).toBe(false);
  });

  it("창 크기를 바꾸면 새로고침 없이 바로 바뀐다", () => {
    const viewport = stubViewport(1440);
    const { result } = renderHook(() => usePcShell());

    viewport.resize(1000);
    expect(result.current).toBe(false);

    viewport.resize(1300);
    expect(result.current).toBe(true);
  });
});

function renderRecords() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/records"]}>
        <Routes>
          <Route element={<ShellLayout />}>
            <Route path="/records" element={<p>기록 페이지</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ShellLayout", () => {
  it("PC면 상단 바와 함께 페이지를 한 번만 그린다", async () => {
    stubViewport(1440);

    renderRecords();

    expect(await screen.findByRole("banner")).toBeInTheDocument();
    expect(screen.getAllByText("기록 페이지")).toHaveLength(1);
  });

  it("PC가 아니면 상단 바 없이 지금 화면 그대로 그린다", () => {
    stubViewport(1199);

    renderRecords();

    expect(screen.getAllByText("기록 페이지")).toHaveLength(1);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });
});
