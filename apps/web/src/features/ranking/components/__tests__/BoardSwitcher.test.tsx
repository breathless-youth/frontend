import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  enterGlassChrome,
  lastInlineControls,
  measureControlsNow,
  pressNative,
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

    expect(screen.getByRole("radio", { name: "오전 7–12시, 지금 구간" })).toBeChecked();
    expect(screen.queryByText("7–12시")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "저녁 18–22시" }));
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

  it("종목 탭을 앱의 종목 세그먼트로 보내고 누르면 그 종목으로 바꾼다", () => {
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

    expect(lastInlineControls(postMessage)).toContainEqual(
      expect.objectContaining({
        id: "segment-ranking-type",
        kind: "segment",
        labels: ["순공", "집중률", "시간대"],
        selected: 0,
        disabled: [false, false, false],
        accessibilityLabel: "종목",
      }),
    );
    expect(screen.queryByRole("tablist", { name: "종목" })).not.toBeInTheDocument();

    pressNative("segment-ranking-type", 0);
    expect(onChange).not.toHaveBeenCalled();
    pressNative("segment-ranking-type", 1);
    expect(onChange).toHaveBeenCalledWith({ type: "FOCUS_RATE", period: "WEEKLY" });
  });

  it("명예의 전당이면 그쪽 종목을 보낸다", () => {
    const postMessage = enterGlassChrome("/ranking");
    measureControlsNow();
    render(<BoardSwitcher {...base} selection={{ type: "MAX_STREAK" }} onChange={vi.fn()} />);

    expect(lastInlineControls(postMessage)).toContainEqual(
      expect.objectContaining({
        id: "segment-ranking-type",
        kind: "segment",
        labels: ["누적 시간", "누적 일수", "연속 공부"],
        selected: 2,
        accessibilityLabel: "종목",
      }),
    );
  });
});
