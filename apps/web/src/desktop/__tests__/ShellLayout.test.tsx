import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShellLayout } from "@/desktop/ShellLayout";
import { usePcShell } from "@/desktop/usePcShell";
import type * as amplitude from "@/lib/amplitude";

const setPcLayoutUserProperty = vi.hoisted(() => vi.fn());
vi.mock("@/lib/amplitude", async (original) => ({
  ...(await original<typeof amplitude>()),
  setPcLayoutUserProperty,
}));

/**
 * 창 폭을 흉내 내는 matchMedia
 *
 * 쿼리의 `min-width`를 rem으로 읽어 지금 폭과 비교하므로, 기준 폭을 바꾸면 테스트가 깨진다.
 */
function stubViewport(initialWidth: number, { touchOnly = false } = {}) {
  let width = initialWidth;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => {
    const rem = /min-width:\s*([\d.]+)rem/.exec(query);
    const min = rem ? Number(rem[1]) * 16 : Number.POSITIVE_INFINITY;
    return {
      media: query,
      get matches() {
        if (query.includes("pointer: coarse")) return touchOnly;
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
  vi.clearAllMocks();
});

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

/** 사용자 에이전트와 터치 지점 수를 바꾼다. afterEach가 지워 jsdom 기본값으로 돌린다. */
function stubDevice(userAgent: string, maxTouchPoints = 0, mobile?: boolean) {
  Object.defineProperty(navigator, "userAgent", { value: userAgent, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", { value: maxTouchPoints, configurable: true });
  Object.defineProperty(navigator, "userAgentData", {
    value: mobile === undefined ? undefined : { mobile },
    configurable: true,
  });
}

afterEach(() => {
  for (const key of ["userAgent", "maxTouchPoints", "userAgentData"]) {
    Reflect.deleteProperty(navigator, key);
  }
});

describe("usePcShell", () => {
  it("PC 기기는 창 폭이 900이어도 PC 셸이다", () => {
    stubViewport(900);
    stubDevice(MAC);

    const { result } = renderHook(() => usePcShell());

    expect(result.current).toBe(true);
  });

  it.each([
    ["iPhone", IPHONE, 5, undefined],
    ["Android 태블릿", ANDROID_TABLET, 10, undefined],
    ["데스크톱 모드 iPadOS Safari", MAC, 5, undefined],
    ["userAgentData가 휴대폰이라고 알려 준 브라우저", MAC, 0, true],
  ] as const)("%s는 1440이어도 PC 셸이 아니다", (_name, userAgent, touchPoints, mobile) => {
    stubViewport(1440);
    stubDevice(userAgent, touchPoints, mobile);

    const { result } = renderHook(() => usePcShell());

    expect(result.current).toBe(false);
  });

  it("PC 사용자 에이전트를 보내도 주 입력이 손가락뿐인 태블릿은 PC 셸이 아니다", () => {
    stubViewport(1440, { touchOnly: true });
    stubDevice(MAC, 0, false);

    const { result } = renderHook(() => usePcShell());

    expect(result.current).toBe(false);
  });

  it("터치 화면이 있어도 주 입력이 트랙패드나 마우스인 PC는 PC 셸이다", () => {
    stubViewport(1440);
    stubDevice(WINDOWS, 10, false);

    const { result } = renderHook(() => usePcShell());

    expect(result.current).toBe(true);
  });

  it("앱 웹뷰(브리지 있음)에서는 PC 기기여도 PC 셸이 아니다", () => {
    stubViewport(1440);
    stubDevice(MAC);
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });

    const { result } = renderHook(() => usePcShell());

    expect(result.current).toBe(false);
  });

  it("matchMedia가 없는 환경은 모바일 화면으로 둔다", () => {
    vi.stubGlobal("matchMedia", undefined);

    const { result } = renderHook(() => usePcShell());

    expect(result.current).toBe(false);
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

  it("휴대폰이면 상단 바 없이 지금 화면 그대로 그린다", () => {
    stubViewport(1440);
    stubDevice(IPHONE, 5);

    renderRecords();

    expect(screen.getAllByText("기록 페이지")).toHaveLength(1);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });
});

describe("ShellLayout 사용자 속성", () => {
  it("PC 셸을 그리면 pc_layout을 true로 남기고 창을 좁혀도 바꾸지 않는다", async () => {
    const viewport = stubViewport(1440);
    renderRecords();
    await screen.findByRole("banner");

    viewport.resize(900);

    expect(setPcLayoutUserProperty).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("휴대폰이면 처음부터 false로 남긴다", () => {
    stubViewport(1440);
    stubDevice(IPHONE, 5);

    renderRecords();

    expect(setPcLayoutUserProperty).toHaveBeenCalledExactlyOnceWith(false);
  });
});
