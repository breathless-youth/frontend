import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { IGNORE_ARIA_HIDDEN, renderScreen } from "../../__tests__/renderScreen";
import { buildGroupRoomFixtures } from "../../fixtures";
import { MembersScreen } from "../MembersScreen";

const NOW = new Date("2026-11-02T10:00:00+09:00");
const fixtures = buildGroupRoomFixtures(NOW);
const invite = { code: "K7Q2MX", canRegenerate: true, onShareLink: vi.fn(), onRegenerate: vi.fn() };

function renderMembers(overrides: Partial<ComponentProps<typeof MembersScreen>> = {}) {
  const props = { onBack: vi.fn(), onTransfer: vi.fn(), onKick: vi.fn() };
  renderScreen(
    <MembersScreen
      mode="manage"
      roomName="우리 반 저녁 스터디"
      visibility="private"
      memberCount={5}
      members={fixtures.members}
      invite={invite}
      now={NOW}
      {...props}
      {...overrides}
    />,
  );
  return props;
}

describe("MembersScreen", () => {
  it("멤버 관리는 머리 아래 그룹 정보와 비공개 그룹 초대 카드를 둔다", () => {
    renderMembers();
    expect(screen.getByRole("heading", { level: 1, name: "멤버 관리" })).toBeInTheDocument();
    expect(screen.getByText("우리 반 저녁 스터디 · 비공개 · 멤버 5/6")).toBeInTheDocument();
    expect(
      screen.getByText("링크나 코드를 받은 사람은 수락 없이 바로 멤버가 돼요"),
    ).toBeInTheDocument();
    expect(screen.getByText("K7Q2MX")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "코드 새로 만들기" })).toBeInTheDocument();
    expect(
      screen.getByText("그룹장은 다른 멤버에게 그룹장을 넘긴 뒤에 그룹을 나갈 수 있어요"),
    ).toBeInTheDocument();
  });

  it("멤버 줄의 메뉴는 그룹장 넘기기와 내보내기이고 내보내기 아래 3일 안내가 있다", async () => {
    const user = userEvent.setup();
    const { onKick } = renderMembers({ roomName: "그룹", visibility: "public", invite: null });
    const target = fixtures.members.find((member) => !member.isOwner && !member.isMe);
    await user.click(screen.getByRole("button", { name: `${target?.nickname} 메뉴` }));
    expect(screen.getByRole("menuitem", { name: "그룹장 넘기기" })).toBeInTheDocument();
    expect(screen.getByText("3일 동안 이 그룹에 다시 들어올 수 없어요")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /내보내기/ })).toHaveAccessibleDescription(
      "3일 동안 이 그룹에 다시 들어올 수 없어요",
    );
    await user.click(screen.getByRole("menuitem", { name: /내보내기/ }));
    expect(onKick).toHaveBeenCalledWith(target?.userId);
  });

  it("그룹장 넘기기를 고르면 그 멤버를 넘긴다", async () => {
    const user = userEvent.setup();
    const { onTransfer } = renderMembers();
    await user.click(screen.getByRole("button", { name: "민준 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "그룹장 넘기기" }));
    const minjun = fixtures.members.find((member) => member.nickname === "민준");
    expect(onTransfer).toHaveBeenCalledWith(minjun?.userId);
  });

  it("그룹장인 나의 줄에는 메뉴가 없고 다른 멤버마다 메뉴가 있다", () => {
    renderMembers();
    const menus = screen.getAllByRole("button", { name: / 메뉴$/ });
    expect(menus.map((menu) => menu.getAttribute("aria-label"))).toEqual([
      "수빈 메뉴",
      "도윤 메뉴",
      "하린 메뉴",
      "민준 메뉴",
    ]);
  });

  it("나는 닉네임 대신 나로 쓰고 그룹장 표시를 붙인다", () => {
    renderMembers();
    const me = screen.getByText("나", { ignore: IGNORE_ARIA_HIDDEN }).closest("li");
    expect(me).not.toBeNull();
    expect(within(me as HTMLElement).getByRole("img", { name: "그룹장" })).toBeInTheDocument();
    expect(within(me as HTMLElement).getByText("오늘")).toBeInTheDocument();
    expect(screen.queryByText("열공곰")).toBeNull();
  });

  it("멤버 보기는 초대 카드와 멤버별 메뉴가 없다", () => {
    renderMembers({ mode: "view", roomName: "그룹" });
    expect(screen.getByRole("heading", { level: 1, name: "멤버 보기" })).toBeInTheDocument();
    expect(screen.queryByText("K7Q2MX")).toBeNull();
    expect(screen.queryByRole("button", { name: / 메뉴$/ })).toBeNull();
  });

  it("공개 그룹의 멤버 관리에는 초대 카드가 없다", () => {
    renderMembers({ visibility: "public" });
    expect(screen.getByText("우리 반 저녁 스터디 · 공개 · 멤버 5/6")).toBeInTheDocument();
    expect(screen.queryByText("K7Q2MX")).toBeNull();
    expect(screen.getAllByRole("button", { name: / 메뉴$/ })).toHaveLength(4);
  });

  it("멤버마다 마지막으로 온 날을 쓴다", () => {
    renderMembers({ mode: "view", roomName: "그룹", visibility: "public", invite: null });
    expect(screen.getByText("마지막으로 온 날")).toBeInTheDocument();
    expect(screen.getByText("16일 전")).toBeInTheDocument();
    expect(screen.getByText("2시간 전")).toBeInTheDocument();
  });

  it("공부한 적이 없는 멤버는 마지막으로 온 날을 비운다", () => {
    const [owner, first] = fixtures.members;
    renderMembers({ members: [owner, { ...first, lastStudiedAt: null }] });
    const row = screen.getByText(first.nickname).closest("li");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByText(/(전|어제|오늘)$/)).toBeNull();
    expect(within(row as HTMLElement).queryByText("null")).toBeNull();
  });

  it("멤버를 불러오는 중에는 그룹 정보와 초대 카드는 두고 목록 자리에 자리표시를 둔다", () => {
    renderMembers({ members: [], loading: true });
    expect(screen.getByText("우리 반 저녁 스터디 · 비공개 · 멤버 5/6")).toBeInTheDocument();
    expect(screen.getByText("K7Q2MX")).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("list", { name: "멤버" })).toBeNull();
  });

  it("멤버를 받지 못하면 목록 자리에 오류를 둔다", () => {
    renderMembers({ members: [], error: <p>멤버를 불러오지 못했어요</p> });
    expect(screen.getByText("멤버를 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "멤버" })).toBeNull();
  });

  it("뒤로 가기를 누르면 넘긴다", async () => {
    const { onBack } = renderMembers();
    await userEvent.setup().click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
