import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetNativeTabBarForTests } from "@/lib/nativeTabBar";
import { __resetTabBarPlayForTests } from "@/lib/tabBarPlayCapability";

import { HomeDateStrip } from "../HomeDateStrip";
import { __resetNativeDateBarForTests } from "../nativeHomeDateBar";

const TODAY = "2026-10-26";

function renderStrip(selectedKey = TODAY) {
  const handlers = {
    onSelect: vi.fn(),
    onMenuAction: vi.fn(),
    onStartWithoutSubject: vi.fn(),
  };
  const { container } = render(
    <HomeDateStrip todayKey={TODAY} selectedKey={selectedKey} {...handlers} />,
  );
  return { ...handlers, container };
}

function openAt(search: string) {
  window.history.replaceState(null, "", `/home${search}`);
  resetFlags();
}

function resetFlags() {
  __resetTabBarPlayForTests();
  __resetNativeDateBarForTests();
  __resetNativeTabBarForTests();
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  resetFlags();
});

describe("HomeDateStrip", () => {
  it("오늘까지 30일만 있고 미래 날짜는 없다", () => {
    renderStrip();

    const days = within(screen.getByRole("group", { name: "날짜" })).getAllByRole("button");
    expect(days).toHaveLength(30);
    expect(days.at(-1)).toHaveAccessibleName("10월 26일 월요일, 오늘");
    expect(screen.queryByRole("button", { name: /10월 27일/ })).not.toBeInTheDocument();
    expect(days[0]).toHaveAccessibleName("9월 27일 일요일");
  });

  it("고른 날만 눌린 상태다", () => {
    renderStrip("2026-10-25");

    expect(screen.getByRole("button", { name: "10월 25일 일요일" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "10월 26일 월요일, 오늘" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("날짜를 누르면 그 날을 알린다", () => {
    const { onSelect } = renderStrip();

    fireEvent.click(screen.getByRole("button", { name: "10월 23일 금요일" }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith("2026-10-23");
  });

  it("메뉴 버튼을 누르면 과목 순서 변경·과목 편집 메뉴가 열리고 고른 항목을 알린다", async () => {
    const { onMenuAction } = renderStrip();

    await userEvent.click(screen.getByRole("button", { name: "과목 메뉴" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "과목 순서 변경",
      "과목 편집",
    ]);
    await userEvent.click(screen.getByRole("menuitem", { name: "과목 편집" }));
    expect(onMenuAction).toHaveBeenCalledExactlyOnceWith("edit-subjects");

    await userEvent.click(screen.getByRole("button", { name: "과목 메뉴" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "과목 순서 변경" }));
    expect(onMenuAction).toHaveBeenLastCalledWith("reorder-subjects");
  });

  it("탭 바 재생 버튼이 없는 앱이면 순공 시작 버튼이 있다", () => {
    openAt("");
    const { onStartWithoutSubject } = renderStrip();

    fireEvent.click(screen.getByRole("button", { name: "순공 시작" }));

    expect(onStartWithoutSubject).toHaveBeenCalledTimes(1);
  });

  it("탭 바 재생 버튼이 있는 앱이면 순공 시작 버튼이 없다", () => {
    openAt("?tabBarPlay=1");
    renderStrip();

    expect(screen.queryByRole("button", { name: "순공 시작" })).not.toBeInTheDocument();
  });
});

describe("HomeDateStrip: 앱이 날짜 줄을 그릴 때", () => {
  it("날짜와 메뉴 없이 순공 시작만 남고 Android 앱은 날짜 줄 자리를 비운다", () => {
    openAt("?nativeDateBar=1");
    renderStrip();

    expect(screen.queryByRole("group", { name: "날짜" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "과목 메뉴" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "순공 시작" })).toBeInTheDocument();
    expect(screen.getByTestId("home-date-bar-spacer")).toBeInTheDocument();
  });

  it("Android 앱은 탭 바 재생 버튼이 있어도 날짜 줄 자리를 비운다", () => {
    openAt("?nativeDateBar=1&tabBarPlay=1");
    renderStrip();

    expect(screen.queryByRole("button", { name: "순공 시작" })).not.toBeInTheDocument();
    expect(screen.getByTestId("home-date-bar-spacer")).toBeInTheDocument();
  });

  it("iOS 앱은 날짜 줄 자리를 비우지 않는다", () => {
    openAt("?nativeDateBar=1&nativeTabBar=1");
    renderStrip();

    expect(screen.queryByRole("group", { name: "날짜" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "순공 시작" })).toBeInTheDocument();
    expect(screen.queryByTestId("home-date-bar-spacer")).not.toBeInTheDocument();
  });

  it("iOS 앱에서 탭 바 재생 버튼까지 있으면 아무것도 그리지 않는다", () => {
    openAt("?nativeDateBar=1&nativeTabBar=1&tabBarPlay=1");
    const { container } = renderStrip();

    expect(container).toBeEmptyDOMElement();
  });
});
