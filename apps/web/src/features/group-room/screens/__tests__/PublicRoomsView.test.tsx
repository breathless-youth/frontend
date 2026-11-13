import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stubIntersectionObserver } from "@/test/intersectionObserverStub";

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

afterEach(() => vi.restoreAllMocks());

describe("PublicRoomsView", () => {
  it("한 줄이면 더보기 버튼을 표시하지 않는다", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(36);
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
    expect(screen.queryByRole("button", { name: "더보기" })).toBeNull();
    vi.restoreAllMocks();
  });
  it("카테고리를 접고 펼치며 선택한 항목을 접힌 첫 줄에 유지한다", async () => {
    function Harness() {
      const [category, setCategory] = useState<string | null>(null);
      return (
        <PublicRoomsView
          query=""
          onQueryChange={vi.fn()}
          categories={fixtures.categories}
          category={category}
          onCategoryChange={setCategory}
          rooms={[]}
          onOpenRoom={vi.fn()}
        />
      );
    }
    const height = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(78);
    renderScreen(<Harness />);
    const toggle = screen.getByRole("button", { name: "더보기" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "접기" })).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByRole("button", { name: "어학" }));
    await userEvent.click(screen.getByRole("button", { name: "접기" }));
    const group = screen.getByRole("group", { name: /시험|카테고리/ });
    expect(within(group).getAllByRole("button")[1]).toHaveTextContent("어학");
    expect(screen.getByRole("button", { name: "어학" })).toHaveAttribute("aria-pressed", "true");
    height.mockRestore();
  });

  it("접힌 상태에서 다른 칩을 골라도 칩 순서가 그대로다", async () => {
    function Harness() {
      const [category, setCategory] = useState<string | null>(null);
      return (
        <PublicRoomsView
          query=""
          onQueryChange={vi.fn()}
          categories={fixtures.categories}
          category={category}
          onCategoryChange={setCategory}
          rooms={[]}
          onOpenRoom={vi.fn()}
        />
      );
    }
    const height = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(78);
    renderScreen(<Harness />);
    const group = screen.getByRole("group", { name: /시험|카테고리/ });
    await userEvent.click(within(group).getByRole("button", { name: "어학" }));
    expect(within(group).getByRole("button", { name: "어학" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(group)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(chipLabels);
    height.mockRestore();
  });

  it("한 줄에 다 들어갈 때 고른 칩은 폭이 줄어 접히면 전체 바로 뒤에 온다", async () => {
    const callbacks: (() => void)[] = [];
    const remeasure = () => callbacks.forEach((callback) => callback());
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          callbacks.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
    function Harness() {
      const [category, setCategory] = useState<string | null>(null);
      return (
        <PublicRoomsView
          query=""
          onQueryChange={vi.fn()}
          categories={fixtures.categories}
          category={category}
          onCategoryChange={setCategory}
          rooms={[]}
          onOpenRoom={vi.fn()}
        />
      );
    }
    const height = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(36);
    renderScreen(<Harness />);
    const group = screen.getByRole("group", { name: /시험|카테고리/ });
    await userEvent.click(within(group).getByRole("button", { name: "어학" }));
    height.mockReturnValue(78);
    act(() => remeasure());
    expect(within(group).getAllByRole("button")[1]).toHaveTextContent("어학");
    expect(within(group).getByRole("button", { name: "어학" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    height.mockRestore();
    vi.unstubAllGlobals();
  });

  it("처음 들어올 때 이미 골라 둔 칩은 접힌 줄에서 전체 바로 뒤에 온다", () => {
    const language = fixtures.categories.find((option) => option.label === "어학")!;
    const height = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(78);
    renderScreen(
      <PublicRoomsView
        query=""
        onQueryChange={vi.fn()}
        categories={fixtures.categories}
        category={language.value}
        onCategoryChange={vi.fn()}
        rooms={[]}
        onOpenRoom={vi.fn()}
      />,
    );
    const group = screen.getByRole("group", { name: /시험|카테고리/ });
    expect(within(group).getAllByRole("button")[1]).toHaveTextContent("어학");
    height.mockRestore();
  });

  it("더보기와 접기 옆 화살표는 글자가 아니라 아이콘이다", async () => {
    const height = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(78);
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
    const toggle = screen.getByRole("button", { name: "더보기" });
    expect(toggle.textContent).toBe("더보기");
    expect(toggle.querySelector("svg")).not.toBeNull();
    await userEvent.click(toggle);
    const collapse = screen.getByRole("button", { name: "접기" });
    expect(collapse.textContent).toBe("접기");
    expect(collapse.querySelector("svg")).toHaveClass("rotate-180");
    height.mockRestore();
  });

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

  it("카드는 멤버 수, 시험·목표, 이번 주 합계, 공부 상태를 보이고 누르면 그 그룹을 연다", async () => {
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
      "새벽 5시 기상 공시반, 신청 후 입장, 멤버 4/6, 공무원, 이번 주 합계 21시간 10분, 2명 공부 중",
    );
    expect(within(card).getByText("멤버 4/6")).toBeInTheDocument();
    expect(within(card).getByText("공무원")).toBeInTheDocument();
    expect(card).toHaveTextContent("이번 주 합계 21시간 10분");
    expect(card).not.toHaveTextContent("평균");
    expect(within(card).getByText("2명 공부 중")).toBeInTheDocument();
    await userEvent.setup().click(card);
    expect(onOpenRoom).toHaveBeenCalledWith(7);
  });

  it("그룹 이름이 든 카드는 클릭 분석이 글자와 aria-label을 싣지 않게 가린다", () => {
    renderScreen(
      <PublicRoomsView
        query=""
        onQueryChange={vi.fn()}
        categories={fixtures.categories}
        category={null}
        onCategoryChange={vi.fn()}
        rooms={fixtures.publicRooms}
        onOpenRoom={vi.fn()}
      />,
    );
    const card = screen.getByRole("button", { name: /새벽 5시 기상 공시반/ });
    expect(card).toHaveAttribute("data-amp-mask");
    expect(card).toHaveAttribute("data-amp-mask-attributes", "aria-label");
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

  it("받아 둔 공개 그룹이 있으면 다시 받다 실패해도 오류 대신 목록을 둔다", () => {
    renderScreen(
      <PublicRoomsView
        query=""
        onQueryChange={vi.fn()}
        categories={fixtures.categories}
        category={null}
        onCategoryChange={vi.fn()}
        rooms={fixtures.publicRooms}
        loading
        error={<p>공개 그룹을 불러오지 못했어요</p>}
        onOpenRoom={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /새벽 5시 기상 공시반/ })).toBeInTheDocument();
    expect(screen.queryByText("공개 그룹을 불러오지 못했어요")).toBeNull();
    expect(screen.queryByRole("status", { name: "불러오는 중" })).toBeNull();
  });

  it("공개 그룹이 없을 때 오류 자리를 넘기면 자리표시와 빈 상태 대신 그것을 둔다", () => {
    renderScreen(
      <PublicRoomsView
        query=""
        onQueryChange={vi.fn()}
        categories={fixtures.categories}
        category={null}
        onCategoryChange={vi.fn()}
        rooms={[]}
        loading
        error={<p>공개 그룹을 불러오지 못했어요</p>}
        onOpenRoom={vi.fn()}
      />,
    );
    expect(screen.getByText("공개 그룹을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "불러오는 중" })).toBeNull();
    expect(screen.queryByText("아직 공개 그룹이 없어요")).toBeNull();
  });

  it("다음 쪽이 있으면 목록 끝에 감지 칸을 두고 칸이 보이면 다음 쪽을 부른다", () => {
    const observer = stubIntersectionObserver();
    const onLoadMore = vi.fn();
    renderScreen(
      <PublicRoomsView
        query=""
        onQueryChange={vi.fn()}
        categories={fixtures.categories}
        category={null}
        onCategoryChange={vi.fn()}
        rooms={fixtures.publicRooms}
        hasMore
        onLoadMore={onLoadMore}
        onOpenRoom={vi.fn()}
      />,
    );
    const lastCard = screen.getAllByRole("listitem").at(-1)!;
    // 감지 칸은 마지막 카드 뒤에 온다.
    expect(
      lastCard.compareDocumentPosition(screen.getByTestId("public-rooms-more")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    act(() => observer.reach());
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("다음 쪽이 없거나 IntersectionObserver가 없으면 다음 쪽을 부르지 않는다", () => {
    const props = {
      query: "",
      onQueryChange: vi.fn(),
      categories: fixtures.categories,
      category: null,
      onCategoryChange: vi.fn(),
      rooms: fixtures.publicRooms,
      onLoadMore: vi.fn(),
      onOpenRoom: vi.fn(),
    };
    const { rerender } = renderScreen(<PublicRoomsView {...props} hasMore={false} />);
    expect(screen.queryByTestId("public-rooms-more")).toBeNull();

    // jsdom처럼 IntersectionObserver가 없는 엔진에서도 감지 칸만 두고 오류 없이 그린다.
    rerender(<PublicRoomsView {...props} hasMore />);

    expect(screen.getByTestId("public-rooms-more")).toBeInTheDocument();
    expect(props.onLoadMore).not.toHaveBeenCalled();
  });
});
