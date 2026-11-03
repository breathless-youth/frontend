import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderScreen } from "../../__tests__/renderScreen";
import { buildGroupRoomFixtures } from "../../fixtures";
import type { ApplyState, PublicRoomDetail } from "../../types";
import { PublicRoomDetailScreen } from "../PublicRoomDetailScreen";

const NOW = new Date("2026-11-02T10:00:00+09:00");
const fixtures = buildGroupRoomFixtures(NOW);

function renderDetail(
  applyState: ApplyState,
  overrides: Partial<PublicRoomDetail> = {},
  pending = false,
) {
  const props = { onBack: vi.fn(), onApply: vi.fn(), onCancelApplication: vi.fn() };
  renderScreen(
    <PublicRoomDetailScreen
      room={{ ...fixtures.publicDetail, ...overrides }}
      applyState={applyState}
      now={NOW}
      fetchedAtMs={NOW.getTime()}
      pending={pending}
      {...props}
    />,
  );
  return props;
}

describe("PublicRoomDetailScreen", () => {
  it("그룹 이름, 그룹장 닉네임, 소개가 클릭 분석에 실리지 않게 화면 전체에 가림 표시를 단다", () => {
    renderDetail({ kind: "can_apply" });
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("data-amp-mask");
    expect(main).toHaveAttribute("data-amp-mask-attributes", "aria-label");
  });

  it("신청할 수 있으면 아래 줄에 신청하기만 둔다", async () => {
    const { onApply } = renderDetail({ kind: "can_apply" });
    const apply = screen.getByRole("button", { name: "신청하기" });
    // 버튼 위에 안내 글을 두지 않아서 아래 줄의 글은 버튼 글자뿐이다.
    expect(apply.parentElement?.textContent).toBe("신청하기");
    await userEvent.setup().click(apply);
    expect(onApply).toHaveBeenCalledOnce();
  });

  it("이미 신청한 그룹은 신청 취소이고 누르면 취소를 넘긴다", async () => {
    const { onCancelApplication } = renderDetail({ kind: "applied" });
    const cancel = screen.getByRole("button", { name: "신청 취소" });
    expect(cancel).toBeEnabled();
    await userEvent.setup().click(cancel);
    expect(onCancelApplication).toHaveBeenCalledOnce();
  });

  it("자리가 다 찬 그룹은 신청하기를 누를 수 없다", () => {
    renderDetail({ kind: "full" });
    expect(screen.getByRole("button", { name: "신청하기" })).toBeDisabled();
  });

  it("신청할 수 없는 이유가 있으면 흐린 버튼의 글자가 이유다", () => {
    renderDetail({ kind: "blocked", reason: "pending_applications_full" });
    expect(screen.getByRole("button", { name: "신청은 3곳까지 보낼 수 있어요" })).toBeDisabled();
  });

  it("신청을 보내는 중에는 누를 수 없다", () => {
    renderDetail({ kind: "can_apply" }, {}, true);
    expect(screen.getByRole("button", { name: "신청하기" })).toBeDisabled();
  });

  it("신청을 취소하는 중에도 누를 수 없다", () => {
    renderDetail({ kind: "applied" }, {}, true);
    expect(screen.getByRole("button", { name: "신청 취소" })).toBeDisabled();
  });

  it("소개가 길면 더 보기로 펼친다", async () => {
    renderDetail({ kind: "can_apply" }, { intro: "가".repeat(150) });
    expect(screen.queryByText("가".repeat(150))).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "더 보기" }));
    expect(screen.getByText("가".repeat(150))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull();
  });

  it("소개가 120자까지면 더 보기 없이 다 보인다", () => {
    renderDetail({ kind: "can_apply" }, { intro: "가".repeat(120) });
    expect(screen.getByText("가".repeat(120))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull();
  });

  it("그룹 소개가 비면 소개 칸을 그리지 않는다", () => {
    renderDetail({ kind: "can_apply" }, { intro: "" });
    expect(screen.queryByText("그룹 소개")).toBeNull();
  });

  it("그룹 소개가 공백과 줄바꿈뿐이어도 소개 칸을 그리지 않는다", () => {
    renderDetail({ kind: "can_apply" }, { intro: "  \n \n  " });
    expect(screen.queryByText("그룹 소개")).toBeNull();
  });

  it("그룹장, 이번 주 멤버 평균 순공, 오늘 멤버 책상을 보인다", () => {
    renderDetail({ kind: "can_apply" });
    // 그룹장 닉네임은 그룹장 책상에도 있어서 그룹장 줄 안에서 찾는다.
    const ownerRow = screen.getByText("그룹장").parentElement;
    expect(ownerRow).not.toBeNull();
    expect(within(ownerRow as HTMLElement).getByText("옥수수라떼")).toBeInTheDocument();
    expect(screen.getByText(/21시간 10분/)).toBeInTheDocument();
    const today = screen.getByRole("region", { name: "오늘 멤버" });
    expect(within(today).getByText("2명 공부 중")).toBeInTheDocument();
    expect(within(today).getByRole("list", { name: "멤버 책상" })).toBeInTheDocument();
  });

  it("뒤로 가기를 누르면 넘긴다", async () => {
    const { onBack } = renderDetail({ kind: "can_apply" });
    await userEvent.setup().click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
