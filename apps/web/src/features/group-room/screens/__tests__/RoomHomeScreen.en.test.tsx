import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";

import { renderScreen } from "../../__tests__/renderScreen";
import { buildGroupRoomFixtures } from "../../fixtures";
import type { RoomHome } from "../../types";
import { RoomHomeScreen } from "../RoomHomeScreen";

const HANGUL = /[가-힣]/;
const NOW = new Date("2026-11-02T10:00:00+09:00");
const fixtures = buildGroupRoomFixtures(NOW);

// 그룹 이름, 닉네임, 시험·목표 이름은 서버와 호출부가 넘기는 값이라 영어 화면에서는 영어 값을 넘긴다.
const nicknameOf = (userId: number) => `Member ${userId}`;
const ROOM: RoomHome = {
  ...fixtures.roomHome,
  name: "Night owls",
  categoryLabel: "College entrance",
  intro: "",
  members: fixtures.roomHome.members.map((member) => ({
    ...member,
    nickname: nicknameOf(member.userId),
  })),
  weeklyRanks: fixtures.roomHome.weeklyRanks.map((row) => ({
    ...row,
    nickname: nicknameOf(row.userId),
  })),
};

/** 메뉴가 포털로 그려져서 화면 전체의 글자와 aria-label을 함께 모은다. */
function visibleText(): string {
  const labels = [...document.body.querySelectorAll("[aria-label]")].map((el) =>
    el.getAttribute("aria-label"),
  );
  return [document.body.textContent, ...labels].join("\n");
}

afterEach(async () => {
  await i18n.changeLanguage("ko");
});

describe("그룹 홈 영어 화면", () => {
  it("영어로 바꾸면 그룹 계산 모듈이 만든 문장과 그룹 메뉴에도 한글이 남지 않는다", async () => {
    await i18n.changeLanguage("en");
    renderScreen(
      <RoomHomeScreen
        room={ROOM}
        now={NOW}
        fetchedAtMs={NOW.getTime()}
        defaultMenuOpen
        onBack={vi.fn()}
        onToggleNotify={vi.fn()}
        onMenuSelect={vi.fn()}
        onOpenRequests={vi.fn()}
        onEnterStudyRoom={vi.fn()}
      />,
    );

    expect(screen.getByText("5/6 members")).toBeInTheDocument();
    expect(screen.getByText("3 studying")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Join requests/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Leave group" })).toHaveAccessibleDescription(
      "You can leave after transferring ownership",
    );
    expect(visibleText()).not.toMatch(HANGUL);
  });
});
