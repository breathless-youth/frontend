import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as tokenSourceModule from "@/lib/auth/tokenSource";
import type { AuthSnapshot, TokenSource } from "@/lib/auth/tokenSource";
import { legacyQuery, legacyUserId, parseUserId, readUserId, useUserId } from "@/lib/userId";

const mocks = vi.hoisted(() => ({ source: null as TokenSource | null }));
vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof tokenSourceModule>()),
  getTokenSource: () => mocks.source,
}));

function fakeSource(overrides: Partial<TokenSource>): TokenSource {
  return {
    getAccessToken: vi.fn(),
    getCurrentToken: vi.fn(),
    refresh: vi.fn(),
    getUserId: vi.fn(() => null),
    hasSettled: () => true,
    subscribe: vi.fn(() => () => {}),
    ...overrides,
  };
}

afterEach(() => {
  mocks.source = null;
});

describe("parseUserId", () => {
  it("양의 정수 문자열만 숫자로 받는다", () => {
    expect(parseUserId("7")).toBe(7);
  });

  it.each([null, "", "0", "-1", "1.5", "abc", "1abc"])("%s 는 null", (raw) => {
    expect(parseUserId(raw)).toBeNull();
  });

  // 비십진 표기·안전 정수 초과는 신뢰 경계에서 거부한다 (적대적 리뷰 회귀 케이스).
  it.each(["0x10", "1e2", " 7", "+7", "9999999999999999999999"])("%s 는 null", (raw) => {
    expect(parseUserId(raw)).toBeNull();
  });
});

describe("readUserId", () => {
  it("쿼리 문자열에서 userId를 읽는다", () => {
    expect(readUserId("?userId=7&appVersion=1.4.2")).toBe(7);
  });

  it("userId가 없거나 형식이 틀리면 null", () => {
    expect(readUserId("")).toBeNull();
    expect(readUserId("?appVersion=1.4.2")).toBeNull();
    expect(readUserId("?userId=abc")).toBeNull();
  });

  it("토큰 출처가 있으면 그 userId가 URL보다 우선한다", () => {
    mocks.source = fakeSource({ getUserId: () => 9 });
    expect(readUserId("?userId=7")).toBe(9);
  });

  it("토큰 출처의 userId가 null이면 URL로 폴백한다", () => {
    mocks.source = fakeSource({ getUserId: () => null });
    expect(readUserId("?userId=7")).toBe(7);
  });
});

describe("useUserId", () => {
  function wrapperFor(entry: string) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>;
    };
  }

  it("현재 라우트의 userId 쿼리를 돌려준다", () => {
    const { result } = renderHook(() => useUserId(), { wrapper: wrapperFor("/home?userId=7") });
    expect(result.current).toBe(7);
  });

  it("쿼리가 없으면 null (브라우저 단독 모드)", () => {
    const { result } = renderHook(() => useUserId(), { wrapper: wrapperFor("/home") });
    expect(result.current).toBeNull();
  });

  it("라우트가 바뀌면 새 쿼리의 userId를 돌려준다", () => {
    function Probe() {
      const userId = useUserId();
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate("/records?userId=9")}>
          {userId === null ? "none" : String(userId)}
        </button>
      );
    }
    render(
      <MemoryRouter initialEntries={["/home?userId=7"]}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button")).toHaveTextContent("7");
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("9");
  });

  it("토큰 출처가 있으면 그 userId가 URL보다 우선한다", () => {
    mocks.source = fakeSource({ getUserId: () => 9 });
    const { result } = renderHook(() => useUserId(), { wrapper: wrapperFor("/home?userId=7") });
    expect(result.current).toBe(9);
  });

  it("토큰 출처의 userId가 바뀌면(구독 알림) 훅이 다시 렌더된다", () => {
    let userId: number | null = null;
    let notify: (snapshot: AuthSnapshot) => void = () => {};
    mocks.source = fakeSource({
      getUserId: () => userId,
      subscribe: (listener) => {
        notify = listener;
        return () => {};
      },
    });
    const { result } = renderHook(() => useUserId(), { wrapper: wrapperFor("/home?userId=7") });
    expect(result.current).toBe(7);

    act(() => {
      userId = 9;
      notify({ userId: 9, accessToken: null });
    });
    expect(result.current).toBe(9);
  });

  it("토큰 출처가 있어도 userId가 null이고 URL에도 없으면 null", () => {
    mocks.source = fakeSource({ getUserId: () => null });
    const { result } = renderHook(() => useUserId(), { wrapper: wrapperFor("/home") });
    expect(result.current).toBeNull();
  });
});

describe("legacyUserId", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("토큰 출처가 있으면 URL에 userId가 있어도 null이다", () => {
    mocks.source = fakeSource({ getUserId: () => 9 });
    window.history.replaceState(null, "", "/home?userId=7");
    expect(legacyUserId()).toBeNull();
  });

  it("토큰 출처가 없고 URL에 userId가 있으면 그 값이다", () => {
    window.history.replaceState(null, "", "/home?userId=7&appVersion=1.4.2");
    expect(legacyUserId()).toBe(7);
  });

  it("토큰 출처도 URL userId도 없으면 null이다", () => {
    window.history.replaceState(null, "", "/home");
    expect(legacyUserId()).toBeNull();
  });

  it("URL userId가 형식에 어긋나면 null이다", () => {
    window.history.replaceState(null, "", "/home?userId=abc");
    expect(legacyUserId()).toBeNull();
  });
});

describe("legacyQuery", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("legacy 신원이 있으면 빈 쿼리엔 ?로, 있는 쿼리엔 &로 잇는다", () => {
    window.history.replaceState(null, "", "/home?userId=7");
    expect(legacyQuery("")).toBe("?userId=7");
    expect(legacyQuery("?from=2026-07-01&to=2026-07-31")).toBe(
      "?from=2026-07-01&to=2026-07-31&userId=7",
    );
  });

  it("legacy 신원이 없으면 받은 쿼리를 그대로 돌려준다", () => {
    window.history.replaceState(null, "", "/home");
    expect(legacyQuery("")).toBe("");
    expect(legacyQuery("?date=2026-07-25")).toBe("?date=2026-07-25");
  });
});
