import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BoardModeTabs, BoardSwitcher } from "../BoardSwitcher";

describe("BoardModeTabs", () => {
  it("명예의 전당을 누르면 hall로 바꾼다", async () => {
    const onChange = vi.fn();
    render(<BoardModeTabs value="ranking" onChange={onChange} />);

    await userEvent.click(screen.getByRole("tab", { name: "명예의 전당" }));

    expect(onChange).toHaveBeenCalledWith("hall");
  });

  it("탭 아래에 패널이 없어 없는 패널을 가리키지 않는다", () => {
    render(<BoardModeTabs value="ranking" onChange={vi.fn()} />);

    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).not.toHaveAttribute("aria-controls");
    }
    expect(screen.getByRole("tab", { name: "랭킹" })).toHaveAttribute("aria-selected", "true");
  });

  it("오른쪽 방향키를 누르면 다음 탭으로 가며 그 탭을 고른다", async () => {
    const onChange = vi.fn();
    render(<BoardModeTabs value="ranking" onChange={onChange} />);

    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "명예의 전당" })).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith("hall");
  });
});

describe("BoardSwitcher", () => {
  const base = { resolvedSlot: null, nowSlot: "MORNING" as const };

  it("종목을 바꾸면 그 종목에 없는 기간은 주간이 된다", () => {
    const onChange = vi.fn();
    render(
      <BoardSwitcher
        {...base}
        selection={{ type: "FOCUS_TIME", period: "DAILY" }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "집중률" }));

    expect(onChange).toHaveBeenCalledWith({ type: "FOCUS_RATE", period: "WEEKLY" });
  });

  it("선택된 종목을 다시 누르면 아무 일도 없다", () => {
    const onChange = vi.fn();
    render(
      <BoardSwitcher
        {...base}
        selection={{ type: "FOCUS_TIME", period: "DAILY" }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "순공" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("기간은 그 종목에 있는 것만 보이고 누르면 바꾼다", async () => {
    const onChange = vi.fn();
    render(
      <BoardSwitcher
        {...base}
        selection={{ type: "FOCUS_RATE", period: "WEEKLY" }}
        onChange={onChange}
      />,
    );

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["주간", "월간"]);
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).not.toHaveAttribute("aria-controls");
    }
    await userEvent.click(screen.getByRole("tab", { name: "월간" }));
    expect(onChange).toHaveBeenCalledWith({ type: "FOCUS_RATE", period: "MONTHLY" });
  });

  it("시간대면 구간 칸을 두고, 지금 구간을 표시하고, 서버가 고른 구간을 선택으로 보인다", () => {
    const onChange = vi.fn();
    render(
      <BoardSwitcher
        resolvedSlot="MORNING"
        nowSlot="MORNING"
        selection={{ type: "TIME_SLOT", period: "DAILY", slot: null }}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("radio", { name: "오전 7–12시, 지금 구간" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "저녁 18–22시" }));
    expect(onChange).toHaveBeenCalledWith({ type: "TIME_SLOT", period: "DAILY", slot: "EVENING" });
  });

  it("명예의 전당 쪽은 종목 칩만 둔다", () => {
    render(<BoardSwitcher {...base} selection={{ type: "MAX_STREAK" }} onChange={vi.fn()} />);

    expect(screen.getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
      "누적 시간",
      "누적 일수",
      "연속 공부",
    ]);
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});
