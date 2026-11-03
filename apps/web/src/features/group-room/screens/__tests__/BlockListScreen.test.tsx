import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderScreen } from "../../__tests__/renderScreen";
import { buildGroupRoomFixtures } from "../../fixtures";
import { BlockListScreen } from "../BlockListScreen";

const fixtures = buildGroupRoomFixtures(new Date("2026-11-02T10:00:00+09:00"));

describe("BlockListScreen", () => {
  it("안내 문장과 차단한 사람마다 차단 해제를 둔다", async () => {
    const onUnblock = vi.fn();
    renderScreen(
      <BlockListScreen
        users={fixtures.blocked}
        unblockingId={null}
        onBack={vi.fn()}
        onUnblock={onUnblock}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "차단 목록" })).toBeInTheDocument();
    expect(
      screen.getByText("차단한 사람과는 공부방에서 화면과 소리가 오가지 않아요"),
    ).toBeInTheDocument();
    await userEvent.setup().click(screen.getAllByRole("button", { name: /차단 해제/ })[0]);
    expect(onUnblock).toHaveBeenCalledWith(fixtures.blocked[0].userId);
  });

  it("차단 해제 버튼마다 누구를 푸는지 설명으로 붙인다", () => {
    renderScreen(
      <BlockListScreen
        users={fixtures.blocked}
        unblockingId={null}
        onBack={vi.fn()}
        onUnblock={vi.fn()}
      />,
    );
    expect(
      screen.getAllByRole("button", { name: "차단 해제" }).map((button) => {
        const describedBy = button.getAttribute("aria-describedby") ?? "";
        return document.getElementById(describedBy)?.textContent;
      }),
    ).toEqual(fixtures.blocked.map((user) => user.nickname));
  });

  it("차단을 푸는 중인 사람의 버튼만 누를 수 없다", () => {
    const [first] = fixtures.blocked;
    renderScreen(
      <BlockListScreen
        users={fixtures.blocked}
        unblockingId={first.userId}
        onBack={vi.fn()}
        onUnblock={vi.fn()}
      />,
    );
    const [firstButton, secondButton] = screen.getAllByRole("button", { name: "차단 해제" });
    expect(firstButton).toBeDisabled();
    expect(secondButton).toBeEnabled();
  });

  it("차단한 사람이 없으면 차단한 사람이 없어요다", () => {
    renderScreen(
      <BlockListScreen users={[]} unblockingId={null} onBack={vi.fn()} onUnblock={vi.fn()} />,
    );
    expect(screen.getByText("차단한 사람이 없어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "차단 해제" })).toBeNull();
  });

  it("차단 목록을 불러오는 중에는 안내 문장은 두고 빈 상태 대신 자리표시를 둔다", () => {
    renderScreen(
      <BlockListScreen
        users={[]}
        unblockingId={null}
        loading
        onBack={vi.fn()}
        onUnblock={vi.fn()}
      />,
    );
    expect(
      screen.getByText("차단한 사람과는 공부방에서 화면과 소리가 오가지 않아요"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("차단한 사람이 없어요")).toBeNull();
  });

  it("차단 목록을 받지 못하면 빈 상태 대신 오류 자리를 둔다", () => {
    renderScreen(
      <BlockListScreen
        users={[]}
        unblockingId={null}
        error={<p>차단 목록을 불러오지 못했어요</p>}
        onBack={vi.fn()}
        onUnblock={vi.fn()}
      />,
    );
    expect(screen.getByText("차단 목록을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.queryByText("차단한 사람이 없어요")).toBeNull();
  });

  it("뒤로 가기를 누르면 넘긴다", async () => {
    const onBack = vi.fn();
    renderScreen(
      <BlockListScreen
        users={fixtures.blocked}
        unblockingId={null}
        onBack={onBack}
        onUnblock={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
