import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authorizeAppLock, pickAppLockApps, queryAppLock } from "@/features/app-lock/nativeAppLock";
import { AppLockSettingsPage } from "@/routes/AppLockSettingsPage";

vi.mock("@/features/app-lock/nativeAppLock", () => ({
  queryAppLock: vi.fn(),
  authorizeAppLock: vi.fn(),
  pickAppLockApps: vi.fn(),
}));

const STATE = {
  supported: true,
  authorized: true,
  revoked: false,
  appCount: 3,
  categoryCount: 1,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/app-lock-settings"]}>
      <AppLockSettingsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(queryAppLock).mockResolvedValue(STATE);
  vi.mocked(authorizeAppLock).mockResolvedValue(STATE);
  vi.mocked(pickAppLockApps).mockResolvedValue({ ...STATE, appCount: 0, categoryCount: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("설정 › 방해 앱 잠금", () => {
  it("꺼져 있으면 잠긴 앱 행 없이 스위치와 기능 설명만 보인다", async () => {
    renderPage();
    expect(await screen.findByRole("switch", { name: "방해 앱 잠금" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.queryByRole("button", { name: /잠긴 앱/ })).toBeNull();
    expect(screen.getByText("기능 설명")).toBeTruthy();
    expect(screen.getByText("공부를 시작하면 잠기고, 공부를 끝내면 풀려요.")).toBeTruthy();
    expect(screen.getByText("일시정지 중에도 잠겨 있어요.")).toBeTruthy();
  });

  it("켜면 잠긴 앱 행이 요약과 함께 나타나고, 누르면 고르기를 연다", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("switch", { name: "방해 앱 잠금" }));

    const row = await screen.findByRole("button", { name: "잠긴 앱, 앱 3개 · 카테고리 1개" });
    fireEvent.click(row);
    expect(pickAppLockApps).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "잠긴 앱, 선택 안 함" })).toBeTruthy();
  });

  it("툴팁 버튼이 있다", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "방해 앱 잠금 안내" })).toBeTruthy();
  });
});
