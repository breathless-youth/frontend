import type { RankingUnseenResponse } from "@focusmakers/types";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FIXTURE_UNSEEN_FIVE,
  FIXTURE_UNSEEN_MIXED,
  FIXTURE_UNSEEN_ONE,
  FIXTURE_UNSEEN_THREE,
  FIXTURE_UNSEEN_WEEKLY_THIRD,
} from "@/lib/rankingFixtures";

import { MedalModal } from "../MedalModal";
import { medalModalView } from "../medalView";

afterEach(() => vi.clearAllMocks());

function renderModal(unseen: RankingUnseenResponse) {
  const handlers = { onRecords: vi.fn(), onClose: vi.fn() };
  render(<MedalModal view={medalModalView(unseen)!} open {...handlers} />);
  return handlers;
}

function byText(tag: "P" | "SPAN", text: string) {
  return screen.getByText((_, element) => element?.tagName === tag && element.textContent === text);
}

function rowOf(name: string) {
  return screen.getByText(name).closest("li")!;
}

describe("MedalModal", () => {
  it("1위 하나는 기간·판 한 줄, 제목, 기록, 누적 메달을 보인다", () => {
    renderModal(FIXTURE_UNSEEN_ONE);

    const dialog = screen.getByRole("dialog", { name: "1위로 마감했어요" });
    expect(dialog).toHaveAccessibleDescription("10월 9일 (금) · 일간 · 오전 구간");
    expect(byText("P", "기록 3:04:20")).toBeInTheDocument();
    expect(byText("SPAN", "현재까지 메달을 19번 얻었어요")).toBeInTheDocument();
  });

  it("누적 메달 수는 천 단위 쉼표를 찍는다", () => {
    renderModal({ ...FIXTURE_UNSEEN_ONE, total: 1234 });

    expect(byText("SPAN", "현재까지 메달을 1,234번 얻었어요")).toBeInTheDocument();
  });

  it("주간 3위 하나는 주 이름과 시간 기록을 보인다", () => {
    renderModal(FIXTURE_UNSEEN_WEEKLY_THIRD);

    expect(screen.getByRole("dialog", { name: "3위로 마감했어요" })).toHaveAccessibleDescription(
      "10월 1주 · 주간 · 순공",
    );
    expect(byText("P", "기록 41:20:00")).toBeInTheDocument();
  });

  it("같은 날 셋은 목록 줄마다 판 이름, 순위로 마감, 기록을 보인다", () => {
    renderModal(FIXTURE_UNSEEN_THREE);

    expect(screen.getByRole("dialog", { name: "메달 3개를 땄어요" })).toHaveAccessibleDescription(
      "10월 9일 (금) · 일간",
    );
    expect(rowOf("오전 구간")).toHaveTextContent("1위로 마감");
    expect(rowOf("오전 구간")).toHaveTextContent("3:04:20");
    expect(rowOf("저녁 구간")).toHaveTextContent("3위로 마감");
    expect(screen.queryByText(/^외 /)).toBeNull();
    expect(byText("SPAN", "현재까지 메달을 21번 얻었어요")).toBeInTheDocument();
  });

  it("4개 이상은 순위별 개수와 앞 3개, 나머지 개수를 보인다", () => {
    renderModal(FIXTURE_UNSEEN_FIVE);

    expect(screen.getByRole("dialog", { name: "메달 5개를 땄어요" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "1위 2개" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "2위 1개" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "3위 2개" })).toBeInTheDocument();
    expect(rowOf("새벽 구간")).toHaveTextContent("2:50:10");
    expect(screen.queryByText("오후 구간")).toBeNull();
    expect(screen.getByText("외 2개")).toBeInTheDocument();
  });

  it("기간이 섞이면 위 줄은 마감 시각이고 줄마다 기간을 붙인다", () => {
    renderModal(FIXTURE_UNSEEN_MIXED);

    expect(screen.getByRole("dialog", { name: "메달 3개를 땄어요" })).toHaveAccessibleDescription(
      "10월 12일 (월) 00시 마감",
    );
    expect(rowOf("순공")).toHaveTextContent("주간 · 2위로 마감");
    expect(rowOf("오전 구간")).toHaveTextContent("일간 · 1위로 마감");
  });

  it("열리면 첫 버튼이 아니라 모달 자체로 포커스가 들어온다", () => {
    renderModal(FIXTURE_UNSEEN_ONE);

    expect(screen.getByRole("dialog")).toHaveFocus();
    expect(screen.getByRole("button", { name: "랭킹 기록 보기" })).not.toHaveFocus();
  });

  it("랭킹 기록 보기와 닫기를 누르면 각자 알린다", async () => {
    const handlers = renderModal(FIXTURE_UNSEEN_ONE);

    await userEvent.click(screen.getByRole("button", { name: "랭킹 기록 보기" }));
    await userEvent.click(screen.getByRole("button", { name: "닫기" }));

    expect(handlers.onRecords).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  // 지금은 `onOpenChange`를 달지 않아 Esc가 닫기로 이어질 길이 없고, 나중에 달 때 Esc 막기가 빠지지 않게 지킨다.
  it("버튼으로만 닫혀 Esc에는 반응하지 않는다", async () => {
    const handlers = renderModal(FIXTURE_UNSEEN_ONE);

    await userEvent.keyboard("{Escape}");

    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  // 지금은 `onOpenChange`를 달지 않아 바깥 탭이 닫기로 이어질 길이 없고, 나중에 달 때 바깥 탭 막기가 빠지지 않게 지킨다.
  it("버튼으로만 닫혀 바깥을 눌러도 반응하지 않는다", async () => {
    const handlers = renderModal(FIXTURE_UNSEEN_ONE);
    // 모달이 열린 동안 바깥에서 눌리는 곳은 딤뿐이다.
    // 딤에는 역할이 없어 모달 바로 앞 형제로 찾는다.
    const dim = screen.getByRole("dialog").previousElementSibling;
    expect(dim).not.toBeNull();

    await userEvent.click(dim!);

    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(handlers.onRecords).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
