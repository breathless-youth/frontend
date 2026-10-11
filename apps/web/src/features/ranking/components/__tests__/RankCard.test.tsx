import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  FIXTURE_FIRST_PLACE,
  FIXTURE_FOCUS_WEEKLY,
  FIXTURE_RATE_WEEKLY,
  FIXTURE_SLOT_DAILY,
  FIXTURE_TOTAL_DAYS,
  FIXTURE_TOTAL_TIME,
} from "@/lib/rankingFixtures";

import { rankCardSubLine } from "../../model/live";
import { FirstPlaceCard, RankedCard } from "../RankCard";

/** 여러 요소로 나뉜 한 문단을 글자 그대로 찾는다. */
function paragraph(text: string) {
  return screen.getByText((_, element) => element?.tagName === "P" && element.textContent === text);
}

/** 픽스처 계산 시각(14시 12분)이라 지금 구간은 오후다. */
const AFTERNOON_NOW = Date.parse(FIXTURE_FOCUS_WEEKLY.asOf);
const MORNING_NOW = Date.parse("2026-10-10T10:00:00+09:00");

describe("RankedCard", () => {
  it("순공 판은 이름 없이 다음 순위까지 남은 시간, 진행바, 아랫줄, 작은 집중 시작 버튼", async () => {
    const onFocusStart = vi.fn();
    render(
      <RankedCard
        board={FIXTURE_FOCUS_WEEKLY}
        aboveGap={1320}
        subLine={{ text: "한 세션이면 따라잡을 수 있어요", tone: "muted" }}
        deadline="마감 3일 14시간"
        serverNow={AFTERNOON_NOW}
        onFocusStart={onFocusStart}
      />,
    );

    expect(screen.getByRole("heading", { name: "순공 · 주간" })).toBeInTheDocument();
    expect(screen.getByText("마감 3일 14시간")).toBeInTheDocument();
    expect(paragraph("다음 순위까지 22분")).toBeInTheDocument();
    expect(screen.queryByText("커피세잔", { exact: false })).toBeNull();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "45");
    expect(screen.getByText("한 세션이면 따라잡을 수 있어요")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "집중 시작" }));
    expect(onFocusStart).toHaveBeenCalledTimes(1);
  });

  it("집중률 판은 숫자 없이 따라잡을 수 있다고 말하고 버튼이 없다", () => {
    render(
      <RankedCard
        board={FIXTURE_RATE_WEEKLY}
        aboveGap={0.4}
        subLine={null}
        deadline="마감 1일 9시간"
        serverNow={AFTERNOON_NOW}
        onFocusStart={vi.fn()}
      />,
    );

    expect(paragraph("다음 순위까지 0.4%")).toBeInTheDocument();
    expect(screen.queryByText("형광펜", { exact: false })).toBeNull();
    const catchUp = paragraph("조금만 더 집중하면 따라잡아요");
    expect(catchUp.textContent).not.toMatch(/\d/);
    expect(catchUp.querySelector("strong")).toBeNull();
    expect(screen.queryByRole("button", { name: "집중 시작" })).toBeNull();
  });

  it("집중률 판에서 따라잡을 순공이 null로 오면 그 줄을 비운다", () => {
    render(
      <RankedCard
        board={{
          ...FIXTURE_RATE_WEEKLY,
          above: { nickname: "형광펜", gap: 0.4, focusing: false, catchUpFocusSec: null },
        }}
        aboveGap={0.4}
        subLine={null}
        deadline="마감 1일 9시간"
        serverNow={AFTERNOON_NOW}
        onFocusStart={vi.fn()}
      />,
    );

    expect(paragraph("다음 순위까지 0.4%")).toBeInTheDocument();
    expect(screen.queryByText("집중하면 따라잡아요", { exact: false })).toBeNull();
  });

  it("누적 판은 상위 %와 다음 구간 상자를 둔다", () => {
    render(
      <RankedCard
        board={FIXTURE_TOTAL_TIME}
        aboveGap={12000}
        subLine={null}
        deadline={null}
        serverNow={AFTERNOON_NOW}
        onFocusStart={vi.fn()}
      />,
    );

    expect(screen.getByText("상위 6%")).toBeInTheDocument();
    expect(paragraph("다음 순위까지 3시간 20분")).toBeInTheDocument();
    expect(screen.queryByText("모의고사1등급", { exact: false })).toBeNull();
    expect(paragraph("상위 5%까지 28시간")).toBeInTheDocument();
    expect(paragraph("지금 페이스면 약 9일 뒤")).toBeInTheDocument();
  });

  it("예상 날짜가 없으면 뒤를 뺀다", () => {
    render(
      <RankedCard
        board={FIXTURE_TOTAL_DAYS}
        aboveGap={3}
        subLine={null}
        deadline={null}
        serverNow={AFTERNOON_NOW}
        onFocusStart={vi.fn()}
      />,
    );

    expect(paragraph("다음 순위까지 3일")).toBeInTheDocument();
    expect(screen.queryByText("커피세잔", { exact: false })).toBeNull();
    expect(paragraph("상위 20%까지 4일")).toBeInTheDocument();
    expect(screen.queryByText("지금 페이스면", { exact: false })).toBeNull();
  });

  it("시간대 판도 큰 글자에 이름을 쓰지 않는다", () => {
    render(
      <RankedCard
        board={FIXTURE_SLOT_DAILY}
        aboveGap={540}
        subLine={{ text: "오전이 끝나기 전에 따라잡을 수 있어요", tone: "muted" }}
        deadline="00시 마감"
        serverNow={MORNING_NOW}
        onFocusStart={vi.fn()}
      />,
    );

    expect(paragraph("다음 순위까지 9분")).toBeInTheDocument();
    expect(screen.queryByText("수능D-40", { exact: false })).toBeNull();
  });

  it("바로 위가 집중 중이라는 문구는 두 줄로 그리되 한 문장으로 읽힌다", () => {
    render(
      <RankedCard
        board={FIXTURE_FOCUS_WEEKLY}
        aboveGap={1320}
        subLine={{ text: "커피세잔님이 집중 중이라\n차이가 벌어지고 있어요", tone: "alert" }}
        deadline="마감 3일 14시간"
        serverNow={AFTERNOON_NOW}
        onFocusStart={vi.fn()}
      />,
    );

    const line = screen.getByText("커피세잔님이 집중 중이라 차이가 벌어지고 있어요");
    expect(line.textContent).toBe("커피세잔님이 집중 중이라\n차이가 벌어지고 있어요");
  });

  it("지금 구간이 아닌 시간대 판은 작은 집중 시작을 두지 않는다", () => {
    render(
      <RankedCard
        board={FIXTURE_SLOT_DAILY}
        aboveGap={540}
        subLine={rankCardSubLine({
          board: FIXTURE_SLOT_DAILY,
          belowGap: 360,
          serverNow: AFTERNOON_NOW,
        })}
        deadline="00시 마감"
        serverNow={AFTERNOON_NOW}
        onFocusStart={vi.fn()}
      />,
    );

    expect(paragraph("다음 순위까지 9분")).toBeInTheDocument();
    expect(screen.queryByText("끝나기 전에", { exact: false })).toBeNull();
    expect(screen.queryByRole("button", { name: "집중 시작" })).toBeNull();
  });

  it("지금 구간인 시간대 판은 작은 집중 시작을 그대로 둔다", () => {
    render(
      <RankedCard
        board={{ ...FIXTURE_SLOT_DAILY, slot: "AFTERNOON" }}
        aboveGap={540}
        subLine={{ text: "오후가 끝나기 전에 따라잡을 수 있어요", tone: "muted" }}
        deadline="00시 마감"
        serverNow={AFTERNOON_NOW}
        onFocusStart={vi.fn()}
      />,
    );

    expect(screen.getByText("오후가 끝나기 전에 따라잡을 수 있어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "집중 시작" })).toBeInTheDocument();
  });
});

describe("FirstPlaceCard", () => {
  it("1위 지키는 중과 아랫줄, 큰 집중 시작 버튼", async () => {
    const onFocusStart = vi.fn();
    render(
      <FirstPlaceCard
        board={FIXTURE_FIRST_PLACE}
        subLine={{ text: "합격까지달린다님이 5분 차로 따라오고 있어요", tone: "alert" }}
        deadline="00시 마감"
        onFocusStart={onFocusStart}
      />,
    );

    const headline = paragraph("1위 지키는 중");
    expect(headline.querySelector(".text-primary")?.textContent).toBe("1위");
    expect(screen.getByText("합격까지달린다님이 5분 차로 따라오고 있어요")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "집중 시작" }));
    expect(onFocusStart).toHaveBeenCalledTimes(1);
  });
});
