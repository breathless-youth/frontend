import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderScreen } from "../../__tests__/renderScreen";
import { buildGroupRoomFixtures } from "../../fixtures";
import type { MyRoomSummary, PublicRoomDetail, PublicRoomSummary } from "../../types";
import { MyRoomsView } from "../MyRoomsView";
import { PublicRoomDetailScreen } from "../PublicRoomDetailScreen";
import { PublicRoomsView } from "../PublicRoomsView";

const NOW = new Date("2026-11-02T10:00:00+09:00");
const fixtures = buildGroupRoomFixtures(NOW);

const [firstPublic, ...restPublic] = fixtures.publicRooms;
const translatedPublic: PublicRoomSummary[] = [
  { ...firstPublic!, translatedName: "Dawn Club" },
  ...restPublic,
];
const [firstMine, ...restMine] = fixtures.myRooms;
const translatedMine: MyRoomSummary[] = [
  { ...firstMine!, translatedName: "Dawn Club" },
  ...restMine,
];

function renderPublicList(rooms: PublicRoomSummary[]) {
  return renderScreen(
    <PublicRoomsView
      query=""
      onQueryChange={vi.fn()}
      categories={fixtures.categories}
      category={null}
      onCategoryChange={vi.fn()}
      rooms={rooms}
      onOpenRoom={vi.fn()}
    />,
  );
}

function renderMine(rooms: MyRoomSummary[]) {
  return renderScreen(
    <MyRoomsView
      rooms={rooms}
      pendingCount={0}
      onOpenRoom={vi.fn()}
      onOpenRequests={vi.fn()}
      onOpenPending={vi.fn()}
      onBrowsePublic={vi.fn()}
    />,
  );
}

function renderDetail(overrides: Partial<PublicRoomDetail>) {
  return renderScreen(
    <PublicRoomDetailScreen
      room={{ ...fixtures.publicDetail, ...overrides }}
      applyState={{ kind: "can_apply" }}
      fetchedAtMs={NOW.getTime()}
      pending={false}
      onBack={vi.fn()}
      onApply={vi.fn()}
      onCancelApplication={vi.fn()}
    />,
  );
}

describe("공개 그룹 목록 번역 안내", () => {
  it("번역된 카드가 있으면 안내 줄을 두고 카드에는 번역 이름을 보인다", () => {
    renderPublicList(translatedPublic);
    expect(screen.getByText("그룹 이름을 번역해서 보여주고 있어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dawn Club/ })).toBeInTheDocument();
    expect(screen.queryByText(firstPublic!.name)).not.toBeInTheDocument();
  });

  it("원문 보기를 누르면 원문 이름과 번역 보기로 바뀐다", async () => {
    renderPublicList(translatedPublic);
    await userEvent.click(screen.getByRole("button", { name: "원문 보기" }));
    expect(screen.getByRole("button", { name: new RegExp(firstPublic!.name) })).toBeInTheDocument();
    expect(screen.getByText("원문 이름으로 보여주고 있어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "번역 보기" })).toBeInTheDocument();
  });

  it("번역 이름이 공백뿐이면 안내 줄이 없다", () => {
    renderPublicList([{ ...firstPublic!, translatedName: "  " }, ...restPublic]);
    expect(screen.queryByText("그룹 이름을 번역해서 보여주고 있어요")).not.toBeInTheDocument();
  });

  it("번역된 카드가 없으면 안내 줄이 없다", () => {
    renderPublicList(fixtures.publicRooms);
    expect(screen.queryByText("그룹 이름을 번역해서 보여주고 있어요")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "원문 보기" })).not.toBeInTheDocument();
  });
});

describe("내 그룹 목록 번역 안내", () => {
  it("번역된 카드가 있으면 안내 줄과 번역 이름을 보이고 없으면 줄이 없다", () => {
    const { unmount } = renderMine(translatedMine);
    expect(screen.getByText("그룹 이름을 번역해서 보여주고 있어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dawn Club/ })).toBeInTheDocument();
    unmount();
    renderMine(fixtures.myRooms);
    expect(screen.queryByText("그룹 이름을 번역해서 보여주고 있어요")).not.toBeInTheDocument();
  });

  it("번역 이름이 공백뿐이면 안내 줄 없이 원문 이름을 보인다", () => {
    renderMine([{ ...firstMine!, translatedName: "  " }, ...restMine]);
    expect(screen.queryByText("그룹 이름을 번역해서 보여주고 있어요")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(firstMine!.name) })).toBeInTheDocument();
  });
});

describe("공개 그룹 보기 번역 안내", () => {
  it("이름과 소개를 번역으로 보이고 소개 카드 아래에 번역됨과 원문 보기를 둔다", () => {
    renderDetail({ translatedName: "Dawn Club", translatedIntro: "We study at dawn." });
    expect(screen.getByRole("heading", { name: "Dawn Club" })).toBeInTheDocument();
    const intro = screen.getByRole("region", { name: "그룹 소개" });
    expect(within(intro).getByText("We study at dawn.")).toBeInTheDocument();
    expect(within(intro).getByText("번역됨")).toBeInTheDocument();
    expect(within(intro).getByRole("button", { name: "원문 보기" })).toBeInTheDocument();
  });

  it("원문 보기를 누르면 이름과 소개가 함께 원문으로 바뀐다", async () => {
    renderDetail({ translatedName: "Dawn Club", translatedIntro: "We study at dawn." });
    await userEvent.click(screen.getByRole("button", { name: "원문 보기" }));
    expect(screen.getByRole("heading", { name: fixtures.publicDetail.name })).toBeInTheDocument();
    expect(screen.queryByText("We study at dawn.")).not.toBeInTheDocument();
    expect(screen.getByText("원문")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "번역 보기" })).toBeInTheDocument();
  });

  it("이름만 번역되면 소개는 원문 글이고 안내 줄은 보인다", () => {
    renderDetail({ translatedName: "Dawn Club", translatedIntro: null, intro: "짧은 소개" });
    const intro = screen.getByRole("region", { name: "그룹 소개" });
    expect(within(intro).getByText("짧은 소개")).toBeInTheDocument();
    expect(within(intro).getByText("번역됨")).toBeInTheDocument();
  });

  it("번역이 없으면 안내 줄이 없다", () => {
    renderDetail({ translatedName: null, translatedIntro: null });
    expect(screen.queryByText("번역됨")).not.toBeInTheDocument();
  });

  it("소개가 비었으면 소개 카드 없이 안내 줄만 보이고 원문 보기로 이름을 되돌린다", async () => {
    renderDetail({ intro: "", translatedName: "Dawn Club", translatedIntro: null });
    expect(screen.queryByRole("region", { name: "그룹 소개" })).not.toBeInTheDocument();
    expect(screen.getByText("번역됨")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "원문 보기" }));
    expect(screen.getByRole("heading", { name: fixtures.publicDetail.name })).toBeInTheDocument();
  });

  it("소개가 비었고 번역도 없으면 안내 줄이 없다", () => {
    renderDetail({ intro: "", translatedName: null, translatedIntro: null });
    expect(screen.queryByText("번역됨")).not.toBeInTheDocument();
  });

  it("번역 소개가 공백뿐이면 원문 소개를 보이고 번역됨을 띄우지 않는다", () => {
    renderDetail({ intro: "원문 소개", translatedName: null, translatedIntro: "   " });
    const intro = screen.getByRole("region", { name: "그룹 소개" });
    expect(within(intro).getByText("원문 소개")).toBeInTheDocument();
    expect(screen.queryByText("번역됨")).not.toBeInTheDocument();
  });
});

describe("목록과 상세가 원문 보기 설정을 함께 쓴다", () => {
  it("목록에서 원문 보기를 누른 뒤 연 상세는 원문으로 보인다", async () => {
    const { unmount } = renderPublicList(translatedPublic);
    await userEvent.click(screen.getByRole("button", { name: "원문 보기" }));
    unmount();
    renderDetail({ translatedName: "Dawn Club", translatedIntro: "We study at dawn." });
    expect(screen.getByRole("heading", { name: fixtures.publicDetail.name })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "번역 보기" })).toBeInTheDocument();
  });
});
