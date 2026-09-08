import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { parseUserId, readUserId, useUserId } from "@/lib/userId";

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
});
