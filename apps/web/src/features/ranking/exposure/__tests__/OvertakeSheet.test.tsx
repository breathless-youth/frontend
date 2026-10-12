import type { RankingOvertaken } from "@focusmakers/types";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FIXTURE_HOME_OVERTAKEN } from "@/lib/rankingFixtures";

import { OvertakeSheet } from "../OvertakeSheet";

const OVERTAKEN = FIXTURE_HOME_OVERTAKEN.overtaken!;

afterEach(() => vi.clearAllMocks());

function renderSheet(overtaken: RankingOvertaken = OVERTAKEN) {
  const handlers = { onStudy: vi.fn(), onRanking: vi.fn(), onClose: vi.fn() };
  render(<OvertakeSheet overtaken={overtaken} open {...handlers} />);
  return handlers;
}

function paragraph(text: string) {
  return screen.getByText((_, element) => element?.tagName === "P" && element.textContent === text);
}

describe("OvertakeSheet", () => {
  it("머리글, 두 줄 제목, 순위 변화, 가까운 두 사람을 서버 순서로 보인다", () => {
    renderSheet();

    const sheet = screen.getByRole("dialog", { name: "자리 비운 사이 4명이 추월했어요" });
    expect(within(sheet).getByText("마지막 접속 이후")).toBeInTheDocument();
    expect(paragraph("주간 순공 1,201위 → 1,205위")).toBeInTheDocument();
    const rows = within(sheet).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("커피세잔");
    expect(rows[0]).toHaveTextContent("+22분");
    expect(rows[1]).toHaveTextContent("형광펜");
    expect(rows[1]).toHaveTextContent("+31분");
  });

  it("추월한 사람 수에도 순위와 같이 천 단위 쉼표를 넣는다", () => {
    renderSheet({ ...OVERTAKEN, count: 1205 });

    expect(
      screen.getByRole("dialog", { name: "자리 비운 사이 1,205명이 추월했어요" }),
    ).toBeInTheDocument();
  });

  it("열리면 포커스가 시트로 들어온다", () => {
    renderSheet();

    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("차이가 가장 작은 줄을 강조한다", () => {
    renderSheet({
      ...OVERTAKEN,
      nearest: [
        { ...OVERTAKEN.nearest[1]!, gap: 3900 },
        { ...OVERTAKEN.nearest[0]!, gap: 1320 },
      ],
    });

    expect(screen.getByText("+1시간 5분")).not.toHaveAttribute("data-closest");
    expect(screen.getByText("+22분")).toHaveAttribute("data-closest");
  });

  it("가까운 사람이 없으면 목록 상자를 그리지 않는다", () => {
    renderSheet({ ...OVERTAKEN, nearest: [] });

    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("button", { name: "공부하러 가기" })).toBeInTheDocument();
  });

  it("공부하러 가기와 랭킹 보기를 누르면 각자 알린다", async () => {
    const handlers = renderSheet();

    await userEvent.click(screen.getByRole("button", { name: "공부하러 가기" }));

    expect(handlers.onStudy).toHaveBeenCalledTimes(1);
    expect(handlers.onRanking).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "랭킹 보기" }));

    expect(handlers.onRanking).toHaveBeenCalledTimes(1);
    expect(handlers.onStudy).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it("화면 낭독기 사용자는 다른 화면으로 가지 않고 닫기 버튼으로 닫을 수 있다", async () => {
    const handlers = renderSheet();

    await userEvent.click(screen.getByRole("button", { name: "닫기" }));

    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(handlers.onStudy).not.toHaveBeenCalled();
    expect(handlers.onRanking).not.toHaveBeenCalled();
  });

  it("Esc를 누르면 닫힌다", async () => {
    const handlers = renderSheet();

    await userEvent.keyboard("{Escape}");

    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("손잡이를 충분히 끌어내리면 닫힌다", () => {
    // jsdom에는 PointerEvent와 pointer capture가 없다.
    // 폴리필이 없으면 clientY가 실리지 않는다.
    window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
    HTMLElement.prototype.setPointerCapture = vi.fn();
    const handlers = renderSheet();
    const handle = screen.getByTestId("overtake-sheet-handle");

    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 200, pointerId: 1 });

    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });
});
