import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { useBackTo } from "../useBackTo";

function renderBackTo(entries: string[], fallbackPath = "/social") {
  return renderHook(() => ({ back: useBackTo(fallbackPath), location: useLocation() }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        {children}
      </MemoryRouter>
    ),
  });
}

afterEach(() => {
  window.history.replaceState(null, "");
});

describe("useBackTo", () => {
  it("앞 화면이 없으면 탭 조건을 뺀 주소로 정한 화면으로 바꿔 간다", () => {
    const { result } = renderBackTo(["/social/groups/10?groupRooms=1&tab=public&code=K7Q2MX"]);
    act(() => result.current.back());
    expect(result.current.location.pathname).toBe("/social");
    expect(result.current.location.search).toBe("?groupRooms=1");
  });

  it("같은 화면에서 연달아 불러도 앞 화면으로 한 칸만 돌아간다", () => {
    window.history.replaceState({ idx: 2 }, "");
    const { result } = renderBackTo(["/social", "/social/groups/10", "/social/groups/10/members"]);
    const back = result.current.back;
    act(() => {
      back();
      back();
    });
    expect(result.current.location.pathname).toBe("/social/groups/10");
  });

  it("돌아간 뒤 같은 화면이 다른 주소로 남으면 다시 돌아갈 수 있다", () => {
    window.history.replaceState({ idx: 2 }, "");
    const { result } = renderBackTo([
      "/social",
      "/social/join?code=AAAAAA",
      "/social/join?code=BBBBBB",
    ]);
    act(() => result.current.back());
    expect(result.current.location.search).toBe("?code=AAAAAA");
    act(() => result.current.back());
    expect(result.current.location.pathname).toBe("/social");
  });
});
