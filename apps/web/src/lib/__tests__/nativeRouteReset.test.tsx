import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { expect, it } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { useNativeRouteReset } from "@/lib/nativeRouteReset";

function Probe() {
  useNativeRouteReset();
  const location = useLocation();
  return (
    <div>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="search">{location.search}</span>
    </div>
  );
}

function nativeEntry(): (raw: string) => void {
  return (globalThis as unknown as Record<string, (raw: string) => void>)[NATIVE_MESSAGE_ENTRY];
}

it("reset-route 메시지를 받으면 해당 경로로 이동한다", () => {
  render(
    <MemoryRouter initialEntries={["/settings/licenses"]}>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByTestId("path").textContent).toBe("/settings/licenses");

  act(() => {
    nativeEntry()(JSON.stringify({ type: "reset-route", path: "/settings", atMs: 1 }));
  });

  expect(screen.getByTestId("path").textContent).toBe("/settings");
});

it("현재 쿼리를 승계한다 — userId가 빠지면 탭 루트가 브라우저 단독 모드로 뜬다", () => {
  render(
    <MemoryRouter initialEntries={["/settings/licenses?userId=7&appVersion=1.4.2"]}>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );

  act(() => {
    nativeEntry()(JSON.stringify({ type: "reset-route", path: "/settings", atMs: 1 }));
  });

  expect(screen.getByTestId("path").textContent).toBe("/settings");
  expect(screen.getByTestId("search").textContent).toBe("?userId=7&appVersion=1.4.2");
});

it("다른 메시지는 이동을 일으키지 않는다", () => {
  render(
    <MemoryRouter initialEntries={["/settings/licenses"]}>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );

  act(() => {
    nativeEntry()(JSON.stringify({ type: "theme", scheme: "dark", atMs: 1 }));
  });

  expect(screen.getByTestId("path").textContent).toBe("/settings/licenses");
});
