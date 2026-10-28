import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  enterGlassChrome,
  lastInlineControls,
  measureControlsNow,
  resetGlassChrome,
} from "@/test/nativeControlStub";

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
  const tabsOf = (name: string) =>
    within(screen.getByRole("tablist", { name })).getAllByRole("tab");

  it("랭킹 쪽은 종목 탭에 랭킹 종목을 두고 지금 종목을 고른 것으로 보인다", () => {
    render(
      <BoardSwitcher
        {...base}
        selection={{ type: "FOCUS_RATE", period: "WEEKLY" }}
        onChange={vi.fn()}
      />,
    );

    expect(tabsOf("종목").map((tab) => tab.textContent)).toEqual(["순공", "집중률", "시간대"]);
    expect(screen.getByRole("tab", { name: "집중률" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "순공" })).toHaveAttribute("aria-selected", "false");
  });

  it("순공은 종목 탭과 같은 줄에 기간 세 개를 두고 기간을 누르면 바꾼다", async () => {
    const onChange = vi.fn();
    render(
      <BoardSwitcher
        {...base}
        selection={{ type: "FOCUS_TIME", period: "DAILY" }}
        onChange={onChange}
      />,
    );

    expect(tabsOf("기간").map((tab) => tab.textContent)).toEqual(["일간", "주간", "월간"]);
    expect(screen.getByRole("tab", { name: "일간" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "주간" }));
    expect(onChange).toHaveBeenCalledWith({ type: "FOCUS_TIME", period: "WEEKLY" });
  });

  it("종목을 바꾸면 그 종목에 없는 기간은 주간이 된다", async () => {
    const onChange = vi.fn();
    render(
      <BoardSwitcher
        {...base}
        selection={{ type: "FOCUS_TIME", period: "DAILY" }}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole("tab", { name: "집중률" }));

    expect(onChange).toHaveBeenCalledWith({ type: "FOCUS_RATE", period: "WEEKLY" });
  });

  it("선택된 종목을 다시 누르면 아무 일도 없다", async () => {
    const onChange = vi.fn();
    render(
      <BoardSwitcher
        {...base}
        selection={{ type: "TIME_SLOT", period: "DAILY", slot: "EVENING" }}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole("tab", { name: "시간대" }));

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

    expect(tabsOf("기간").map((tab) => tab.textContent)).toEqual(["주간", "월간"]);
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

    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual([
      "새벽 0–6시",
      "아침 6–12시, 지금 구간",
      "점심 12–18시",
      "저녁 18–24시",
    ]);
    expect(screen.getByRole("radio", { name: "아침 6–12시, 지금 구간" })).toBeChecked();
    expect(screen.queryByText("6–12시")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "저녁 18–24시" }));
    expect(onChange).toHaveBeenCalledWith({ type: "TIME_SLOT", period: "DAILY", slot: "EVENING" });
  });

  it("명예의 전당 쪽은 종목 탭만 두고, 누르면 그 종목으로 바꾼다", async () => {
    const onChange = vi.fn();
    render(<BoardSwitcher {...base} selection={{ type: "MAX_STREAK" }} onChange={onChange} />);

    expect(tabsOf("종목").map((tab) => tab.textContent)).toEqual([
      "누적 시간",
      "누적 일수",
      "연속 공부",
    ]);
    expect(screen.getByRole("tab", { name: "연속 공부" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tablist", { name: "기간" })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();

    await userEvent.click(screen.getByRole("tab", { name: "누적 일수" }));
    expect(onChange).toHaveBeenCalledWith({ type: "TOTAL_DAYS" });
  });
});

describe("BoardSwitcher, 앱 모드", () => {
  const base = { resolvedSlot: null, nowSlot: "MORNING" as const };

  afterEach(() => {
    cleanup();
    resetGlassChrome();
    vi.restoreAllMocks();
  });

  it("종목 탭은 앱 세그먼트로 보내지 않고 웹 탭으로 두며, 기간 칸만 앱으로 보낸다", async () => {
    const postMessage = enterGlassChrome("/ranking");
    measureControlsNow();
    const onChange = vi.fn();
    render(
      <BoardSwitcher
        {...base}
        selection={{ type: "FOCUS_TIME", period: "DAILY" }}
        onChange={onChange}
      />,
    );

    const controls = lastInlineControls(postMessage);
    expect(controls.map((control) => control.accessibilityLabel)).toEqual(["기간"]);
    expect(controls[0]).toEqual(
      expect.objectContaining({ kind: "segment", labels: ["일간", "주간", "월간"], selected: 0 }),
    );

    await userEvent.click(screen.getByRole("tab", { name: "집중률" }));
    expect(onChange).toHaveBeenCalledWith({ type: "FOCUS_RATE", period: "WEEKLY" });
  });

  it("명예의 전당은 기간이 없어 앱으로 보내는 부품이 없다", () => {
    const postMessage = enterGlassChrome("/ranking");
    measureControlsNow();
    render(<BoardSwitcher {...base} selection={{ type: "TOTAL_TIME" }} onChange={vi.fn()} />);

    expect(lastInlineControls(postMessage)).toEqual([]);
  });
});
