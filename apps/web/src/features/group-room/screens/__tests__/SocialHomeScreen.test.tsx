import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderScreen } from "../../__tests__/renderScreen";
import { buildGroupRoomFixtures } from "../../fixtures";
import type { SocialTab } from "../../types";
import { SocialHomeScreen } from "../SocialHomeScreen";

const fixtures = buildGroupRoomFixtures(new Date("2026-11-02T10:00:00+09:00"));

function renderHome(tab: SocialTab) {
  renderScreen(
    <SocialHomeScreen
      tab={tab}
      onTabChange={vi.fn()}
      myCountText="4/5"
      mine={{
        rooms: fixtures.myRooms,
        pendingCount: fixtures.pending.length,
        onOpenRoom: vi.fn(),
        onOpenRequests: vi.fn(),
        onOpenPending: vi.fn(),
        onBrowsePublic: vi.fn(),
      }}
      publicRooms={{
        query: "",
        onQueryChange: vi.fn(),
        categories: fixtures.categories,
        category: null,
        onCategoryChange: vi.fn(),
        rooms: fixtures.publicRooms,
        onOpenRoom: vi.fn(),
      }}
      fab={{ canCreate: true, onCreate: vi.fn(), onJoinWithCode: vi.fn() }}
      pendingSheet={<div data-testid="pending-sheet" />}
    />,
  );
}

describe("SocialHomeScreen", () => {
  it("내 그룹 탭이면 머리 아래 두 탭과 내 그룹 카드, + 버튼, 신청 시트 자리를 둔다", () => {
    renderHome("mine");
    expect(screen.getByRole("heading", { level: 1, name: "그룹" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "내 그룹 4/5" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: /수능 D-200 밤샘반/ })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(
      screen.getByRole("button", { name: "그룹 만들기와 초대코드로 참여" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("pending-sheet")).toBeInTheDocument();
  });

  it("공개 그룹 탭이면 검색창을 보이고 + 버튼이 있다", () => {
    renderHome("public");
    expect(screen.getByRole("tab", { name: "공개 그룹" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("searchbox", { name: "그룹 이름으로 찾기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /수능 D-200 밤샘반/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: "그룹 만들기와 초대코드로 참여" }),
    ).toBeInTheDocument();
  });
});
