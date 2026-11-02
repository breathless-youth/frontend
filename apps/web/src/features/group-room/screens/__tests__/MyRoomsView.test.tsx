import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderScreen } from "../../__tests__/renderScreen";
import { buildGroupRoomFixtures } from "../../fixtures";
import { MyRoomsView } from "../MyRoomsView";

const fixtures = buildGroupRoomFixtures(new Date("2026-11-02T10:00:00+09:00"));

describe("MyRoomsView", () => {
  it("그룹 카드는 이름, 공개 표시, 시험·목표, 멤버 수, 공부 상태를 보이고 누르면 그룹 홈을 연다", async () => {
    const onOpenRoom = vi.fn();
    renderScreen(
      <MyRoomsView
        rooms={fixtures.myRooms}
        pendingCount={1}
        onOpenRoom={onOpenRoom}
        onOpenPending={vi.fn()}
        onBrowsePublic={vi.fn()}
      />,
    );
    const card = screen.getByRole("button", { name: /수능 D-200 밤샘반/ });
    expect(within(card).getByText("공개")).toBeInTheDocument();
    expect(within(card).getByText("수능")).toBeInTheDocument();
    expect(within(card).getByText("멤버 5/6")).toBeInTheDocument();
    expect(within(card).getByText("3명 공부 중")).toBeInTheDocument();
    expect(within(card).getByTestId("desk-row")).toBeInTheDocument();
    await userEvent.setup().click(card);
    expect(onOpenRoom).toHaveBeenCalledWith(fixtures.myRooms[0].roomId);
  });

  it("책상 줄은 읽어 주지 않으므로 카드 이름에 공부 상태까지 담는다", () => {
    renderScreen(
      <MyRoomsView
        rooms={fixtures.myRooms}
        pendingCount={0}
        onOpenRoom={vi.fn()}
        onOpenPending={vi.fn()}
        onBrowsePublic={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /수능 D-200 밤샘반/ })).toHaveAccessibleName(
      "수능 D-200 밤샘반, 공개, 수능, 멤버 5/6, 3명 공부 중",
    );
    const privateCard = screen.getByRole("button", { name: /우리 반 저녁 스터디/ });
    expect(privateCard).toHaveAccessibleName(
      "우리 반 저녁 스터디, 비공개, 내신, 멤버 5/6, 지금은 아무도 없어요",
    );
    expect(within(privateCard).getByText("비공개")).toBeInTheDocument();
    expect(within(privateCard).getByText("지금은 아무도 없어요")).toBeInTheDocument();
  });

  it("답을 기다리는 신청이 있으면 띠를 두고 누르면 시트를 연다", async () => {
    const onOpenPending = vi.fn();
    renderScreen(
      <MyRoomsView
        rooms={fixtures.myRooms}
        pendingCount={1}
        onOpenRoom={vi.fn()}
        onOpenPending={onOpenPending}
        onBrowsePublic={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: /신청 중인 공개 그룹 1/ }));
    expect(onOpenPending).toHaveBeenCalledOnce();
  });

  it("답을 기다리는 신청이 없으면 띠가 없다", () => {
    renderScreen(
      <MyRoomsView
        rooms={fixtures.myRooms}
        pendingCount={0}
        onOpenRoom={vi.fn()}
        onOpenPending={vi.fn()}
        onBrowsePublic={vi.fn()}
      />,
    );
    expect(screen.queryByText(/신청 중인 공개 그룹/)).toBeNull();
  });

  it("들어간 그룹이 없으면 빈 상태와 공개 그룹 둘러보기를 보이고, 신청이 있으면 띠도 둔다", async () => {
    const onBrowsePublic = vi.fn();
    renderScreen(
      <MyRoomsView
        rooms={[]}
        pendingCount={1}
        onOpenRoom={vi.fn()}
        onOpenPending={vi.fn()}
        onBrowsePublic={onBrowsePublic}
      />,
    );
    expect(screen.getByText("아직 들어간 그룹이 없어요")).toBeInTheDocument();
    expect(screen.getByText("공개 그룹에 신청하거나 그룹을 만들어 보세요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /신청 중인 공개 그룹 1/ })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "공개 그룹 둘러보기" }));
    expect(onBrowsePublic).toHaveBeenCalledOnce();
  });

  it("불러오는 중에는 빈 상태 대신 자리표시를 둔다", () => {
    renderScreen(
      <MyRoomsView
        rooms={[]}
        pendingCount={0}
        loading
        onOpenRoom={vi.fn()}
        onOpenPending={vi.fn()}
        onBrowsePublic={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("아직 들어간 그룹이 없어요")).toBeNull();
    expect(screen.queryByRole("button", { name: "공개 그룹 둘러보기" })).toBeNull();
  });

  it("오류 자리를 넘기면 목록 대신 그것을 둔다", () => {
    renderScreen(
      <MyRoomsView
        rooms={fixtures.myRooms}
        pendingCount={0}
        error={<p>그룹을 불러오지 못했어요</p>}
        onOpenRoom={vi.fn()}
        onOpenPending={vi.fn()}
        onBrowsePublic={vi.fn()}
      />,
    );
    expect(screen.getByText("그룹을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /수능 D-200 밤샘반/ })).toBeNull();
  });
});
