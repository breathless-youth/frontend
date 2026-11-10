import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { IGNORE_ARIA_HIDDEN, renderScreen } from "../../__tests__/renderScreen";
import { buildGroupRoomFixtures } from "../../fixtures";
import type { RoomHome } from "../../types";
import { RoomHomeScreen } from "../RoomHomeScreen";

const NOW = new Date("2026-11-02T10:00:00+09:00");
const fixtures = buildGroupRoomFixtures(NOW);

function renderHome(
  room: RoomHome = fixtures.roomHome,
  extra: Partial<ComponentProps<typeof RoomHomeScreen>> = {},
) {
  const props = {
    onBack: vi.fn(),
    onToggleNotify: vi.fn(),
    onMenuSelect: vi.fn(),
    onOpenRequests: vi.fn(),
    onEnterStudyRoom: vi.fn(),
    onInvite: vi.fn(),
  };
  renderScreen(<RoomHomeScreen room={room} fetchedAtMs={NOW.getTime()} {...props} {...extra} />);
  return props;
}

describe("RoomHomeScreen", () => {
  it.each(["public", "private"] as const)(
    "%s 그룹 멤버는 소개 페이지를 연다",
    async (visibility) => {
      const user = userEvent.setup();
      const { onMenuSelect } = renderHome({ ...fixtures.roomHome, role: "member", visibility });
      await user.click(screen.getByRole("button", { name: "그룹 메뉴" }));
      await user.click(screen.getByRole("menuitem", { name: "그룹 소개 보기" }));
      expect(onMenuSelect).toHaveBeenCalledWith("view_intro");
    },
  );

  it("그룹장 메뉴에는 소개 보기가 없다", async () => {
    renderHome();
    await userEvent.click(screen.getByRole("button", { name: "그룹 메뉴" }));
    expect(screen.queryByRole("menuitem", { name: "그룹 소개 보기" })).toBeNull();
  });

  it("머리 줄에 그룹 이름을 두고 그 아래에 공개 표시, 시험·목표, 멤버 수를 둔다", () => {
    renderHome();
    expect(
      screen.getByRole("heading", { level: 1, name: "수능 D-200 밤샘반" }),
    ).toBeInTheDocument();
    expect(screen.getByText("공개")).toBeInTheDocument();
    expect(screen.getByText("수능")).toBeInTheDocument();
    expect(screen.getByText("멤버 5/6")).toBeInTheDocument();
  });

  it("공개 그룹 그룹장에게 새 신청이 있으면 띠와 확인하기를 보인다", async () => {
    const { onOpenRequests } = renderHome();
    expect(screen.getByText("새 신청이 2건 있어요")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /확인하기/ }));
    expect(onOpenRequests).toHaveBeenCalledOnce();
  });

  it("새 신청이 없거나 멤버면 띠가 없다", () => {
    renderHome(fixtures.roomHomeQuiet);
    expect(screen.queryByText(/새 신청이/)).toBeNull();
  });

  it("멤버에게는 새 신청이 있어도 띠가 없다", () => {
    renderHome({ ...fixtures.roomHome, role: "member" });
    expect(screen.queryByText(/새 신청이/)).toBeNull();
  });

  it("오늘 우리 그룹 카드에 공부 중인 사람 수와 책상을 둔다", () => {
    renderHome();
    const today = screen.getByRole("region", { name: "오늘 우리 그룹" });
    expect(within(today).getByText("3명 공부 중")).toBeInTheDocument();
    expect(within(today).getByRole("list", { name: "멤버 책상" })).toBeInTheDocument();
  });

  it("이번 주 순위는 월요일에 새로 시작하고 내 줄을 표시한다", () => {
    renderHome();
    const weekly = screen.getByRole("region", { name: "이번 주 순위" });
    expect(within(weekly).getByText("월요일에 새로 시작해요")).toBeInTheDocument();
    const me = within(weekly).getByText("열공곰", { ignore: IGNORE_ARIA_HIDDEN });
    expect(me.closest("[data-me]")).toHaveAttribute("data-me", "true");
  });

  it("종은 멤버 공부 알림이고 켜짐을 알린다", async () => {
    const { onToggleNotify } = renderHome();
    const bell = screen.getByRole("button", { name: "멤버 공부 알림" });
    expect(bell).toHaveAttribute("aria-pressed", "false");
    await userEvent.setup().click(bell);
    expect(onToggleNotify).toHaveBeenCalledOnce();
  });

  it("알림을 켠 그룹은 종이 눌린 상태다", () => {
    renderHome({ ...fixtures.roomHome, notifyOn: true });
    expect(screen.getByRole("button", { name: "멤버 공부 알림" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("그룹 메뉴는 공개 그룹 그룹장 항목을 보이고 고르면 넘긴다", async () => {
    const user = userEvent.setup();
    const { onMenuSelect } = renderHome();
    await user.click(screen.getByRole("button", { name: "그룹 메뉴" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("신청 확인"),
        "멤버 관리",
        "그룹 설정",
        expect.stringContaining("그룹 나가기"),
      ]),
    );
    await user.click(screen.getByRole("menuitem", { name: /그룹 나가기/ }));
    expect(onMenuSelect).toHaveBeenCalledWith("leave");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("그룹 메뉴는 Esc로 닫는다", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole("button", { name: "그룹 메뉴" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "그룹 메뉴" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("처음부터 그룹 메뉴를 연 채로 그릴 수 있다", () => {
    renderHome(fixtures.roomHome, { defaultMenuOpen: true });
    expect(screen.getByRole("menuitem", { name: /신청 확인/ })).toBeInTheDocument();
  });

  it("아래에는 공부방 들어가기 버튼만 있다", async () => {
    const { onEnterStudyRoom } = renderHome();
    const enter = screen.getByRole("button", { name: "공부방 들어가기" });
    // 버튼 위에 안내 글을 두지 않아서 아래 줄의 글은 버튼 글자뿐이다.
    expect(enter.parentElement?.textContent).toBe("공부방 들어가기");
    await userEvent.setup().click(enter);
    expect(onEnterStudyRoom).toHaveBeenCalledOnce();
  });
});

it("hides approval UI for OPEN owners even with stale request counts", () => {
  renderHome({ ...fixtures.roomHome, joinPolicy: "open" }, { defaultMenuOpen: true });
  expect(screen.queryByText(/새 신청이/)).toBeNull();
  expect(screen.queryByText("신청 확인")).toBeNull();
  expect(screen.queryByText("신청을 받고 있어요")).toBeNull();
  expect(screen.queryByText("빈자리")).toBeNull();
});
