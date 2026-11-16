import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useScrollTopOnEnter } from "../useScrollTopOnEnter";

function Page() {
  useScrollTopOnEnter();
  return <p>문서</p>;
}

let navigateTo: ReturnType<typeof useNavigate> = () => {};
function Grab() {
  const navigate = useNavigate();
  useEffect(() => {
    navigateTo = navigate;
  }, [navigate]);
  return null;
}

function renderRoutes(entries: string[]) {
  render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Grab />
      <Routes>
        <Route path="/settings" element={<p>설정</p>} />
        <Route path="/terms" element={<Page />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useScrollTopOnEnter", () => {
  it("새로 들어오면 앞 화면에서 내린 위치가 아니라 맨 위에서 연다", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderRoutes(["/settings"]);

    act(() => navigateTo("/terms"));

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("뒤로 가기로 돌아올 때는 위치를 건드리지 않는다", () => {
    renderRoutes(["/terms", "/settings"]);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    act(() => navigateTo(-1));

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
