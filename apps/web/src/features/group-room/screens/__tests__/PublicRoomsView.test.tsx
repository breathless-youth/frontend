import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderScreen } from "../../__tests__/renderScreen";
import { buildGroupRoomFixtures } from "../../fixtures";
import { PublicRoomsView } from "../PublicRoomsView";

const fixtures = buildGroupRoomFixtures(new Date("2026-11-02T10:00:00+09:00"));
const chipLabels = ["전체", ...fixtures.categories.map((category) => category.label)];

function SearchHarness({ onQueryChange }: { onQueryChange: (query: string) => void }) {
  const [query, setQuery] = useState("");
  return (
    <PublicRoomsView
      query={query}
      onQueryChange={(next) => {
        setQuery(next);
        onQueryChange(next);
      }}
      categories={fixtures.categories}
      category={null}
      onCategoryChange={vi.fn()}
      rooms={fixtures.publicRooms}
      onOpenRoom={vi.fn()}
    />
  );
}

describe("PublicRoomsView", () => {
  it("검색창과 전체 칩을 두고, 칩은 하나만 고른다", async () => {
    const onCategoryChange = vi.fn();
    renderScreen(
      <PublicRoomsView
        query=""
        onQueryChange={vi.fn()}
        categories={fixtures.categories}
        category={null}
        onCategoryChange={onCategoryChange}
        rooms={fixtures.publicRooms}
        onOpenRoom={vi.fn()}
      />,
    );
    expect(screen.getByRole("searchbox", { name: "그룹 이름으로 찾기" })).toHaveAttribute(
      "placeholder",
      "그룹 이름으로 찾기",
    );
    expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "수능" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.setup().click(screen.getByRole("button", { name: "수능" }));
    expect(onCategoryChange).toHaveBeenCalledWith("수능");
  });

  it("검색 키를 누르면 검색어는 그대로이고 키보드만 내린다", async () => {
    const onQueryChange = vi.fn();
    renderScreen(<SearchHarness onQueryChange={onQueryChange} />);
    const search = screen.getByRole("searchbox");
    await userEvent.setup().type(search, "토익{Enter}");
    expect(search).not.toHaveFocus();
    expect(onQueryChange).toHaveBeenLastCalledWith("토익");
  });

  it("검색어를 바꾸면 넘긴다", async () => {
    const onQueryChange = vi.fn();
    renderScreen(<SearchHarness onQueryChange={onQueryChange} />);
    await userEvent.setup().type(screen.getByRole("searchbox"), "토익");
    expect(onQueryChange).toHaveBeenLastCalledWith("토익");
  });

  it("카드는 멤버 수, 시험·목표, 이번 주 평균, 공부 상태를 보이고 누르면 그 그룹을 연다", async () => {
    const onOpenRoom = vi.fn();
    renderScreen(
      <PublicRoomsView
        query=""
        onQueryChange={vi.fn()}
        categories={fixtures.categories}
        category={null}
        onCategoryChange={vi.fn()}
        rooms={fixtures.publicRooms}
        onOpenRoom={onOpenRoom}
      />,
    );
    const card = screen.getByRole("button", { name: /새벽 5시 기상 공시반/ });
    expect(card).toHaveAccessibleName(
      "새벽 5시 기상 공시반, 멤버 4/6, 공무원, 이번 주 평균 21시간 10분, 2명 공부 중",
    );
    expect(within(card).getByText("멤버 4/6")).toBeInTheDocument();
    expect(within(card).getByText("공무원")).toBeInTheDocument();
    expect(within(card).getByText(/21시간 10분/)).toBeInTheDocument();
    expect(within(card).getByText("2명 공부 중")).toBeInTheDocument();
    await userEvent.setup().click(card);
    expect(onOpenRoom).toHaveBeenCalledWith(7);
  });

  it("조건 없이 비면 아직 공개 그룹이 없어요이고, 칩 말고 다른 버튼은 없다", () => {
    renderScreen(
      <PublicRoomsView
        query=""
        onQueryChange={vi.fn()}
        categories={fixtures.categories}
        category={null}
        onCategoryChange={vi.fn()}
        rooms={[]}
        onOpenRoom={vi.fn()}
      />,
    );
    expect(screen.getByText("아직 공개 그룹이 없어요")).toBeInTheDocument();
    expect(
      screen.getByText("첫 공개 그룹을 만들어 같이 공부할 사람을 모아 보세요"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(chipLabels);
  });

  it("조건이 있는데 비면 조건에 맞는 공개 그룹이 없어요다", () => {
    renderScreen(
      <PublicRoomsView
        query=""
        onQueryChange={vi.fn()}
        categories={fixtures.categories}
        category="수능"
        onCategoryChange={vi.fn()}
        rooms={[]}
        onOpenRoom={vi.fn()}
      />,
    );
    expect(screen.getByText("조건에 맞는 공개 그룹이 없어요")).toBeInTheDocument();
    expect(screen.getByText("다른 조건을 고르거나 직접 그룹을 만들어 보세요")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(chipLabels);
  });

  it("검색어만 있어도 조건이 있는 것이고, 공백뿐인 검색어는 조건이 아니다", () => {
    const props = {
      onQueryChange: vi.fn(),
      categories: fixtures.categories,
      category: null,
      onCategoryChange: vi.fn(),
      rooms: [],
      onOpenRoom: vi.fn(),
    };
    const { rerender } = renderScreen(<PublicRoomsView query="토익" {...props} />);
    expect(screen.getByText("조건에 맞는 공개 그룹이 없어요")).toBeInTheDocument();

    rerender(<PublicRoomsView query="  " {...props} />);

    expect(screen.getByText("아직 공개 그룹이 없어요")).toBeInTheDocument();
  });

  it("불러오는 중에는 검색창과 칩은 두고 빈 상태 대신 자리표시를 둔다", () => {
    renderScreen(
      <PublicRoomsView
        query=""
        onQueryChange={vi.fn()}
        categories={fixtures.categories}
        category={null}
        onCategoryChange={vi.fn()}
        rooms={[]}
        loading
        onOpenRoom={vi.fn()}
      />,
    );
    expect(screen.getByRole("searchbox", { name: "그룹 이름으로 찾기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체" })).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("아직 공개 그룹이 없어요")).toBeNull();
  });

  it("오류 자리를 넘기면 목록 대신 그것을 둔다", () => {
    renderScreen(
      <PublicRoomsView
        query=""
        onQueryChange={vi.fn()}
        categories={fixtures.categories}
        category={null}
        onCategoryChange={vi.fn()}
        rooms={fixtures.publicRooms}
        error={<p>공개 그룹을 불러오지 못했어요</p>}
        onOpenRoom={vi.fn()}
      />,
    );
    expect(screen.getByText("공개 그룹을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /새벽 5시 기상 공시반/ })).toBeNull();
  });
});
