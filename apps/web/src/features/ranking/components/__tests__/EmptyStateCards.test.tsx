import type { RankingBoardResponse, RankingGoalExample } from "@focusmakers/types";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FIXTURE_FIRST, FIXTURE_RESET_DAILY, FIXTURE_RESET_PREVIOUS } from "@/lib/rankingFixtures";

import { FirstCard, GoalExamplesCard, PreviousResultCard, ResetCard } from "../EmptyStateCards";

function paragraph(text: string) {
  return screen.getByText((_, element) => element?.tagName === "P" && element.textContent === text);
}

/** 픽스처 기준 시각(14시 12분)이라 지금 구간은 점심이다. */
const SERVER_NOW = Date.parse(FIXTURE_RESET_DAILY.asOf);

const EVENING_RESET: RankingBoardResponse = {
  ...FIXTURE_RESET_DAILY,
  type: "TIME_SLOT",
  slot: "EVENING",
};

describe("ResetCard", () => {
  it("지금 시작하면 3위 안에 들 때는 몇 위인지만 말한다", async () => {
    const onFocusStart = vi.fn();
    render(
      <ResetCard
        board={{ ...FIXTURE_RESET_DAILY, startNowRank: 3 }}
        deadline="00시 마감"
        serverNow={SERVER_NOW}
        onFocusStart={onFocusStart}
      />,
    );

    expect(screen.getByRole("heading", { name: "순공 · 일간" })).toBeInTheDocument();
    expect(paragraph("지금 시작하면 3위")).toBeInTheDocument();
    expect(screen.queryByText(/새로 시작됐어요/)).toBeNull();
    expect(screen.getByRole("button", { name: "순공 시작" })).toHaveClass("rounded-full");
    await userEvent.click(screen.getByRole("button", { name: "순공 시작" }));
    expect(onFocusStart).toHaveBeenCalledTimes(1);
  });

  it("지금 시작해도 3위 밖(4위 이하)이면 순위 대신 첫 공부 문구를 쓴다", () => {
    render(
      <ResetCard
        board={{ ...FIXTURE_RESET_DAILY, startNowRank: 4 }}
        deadline="00시 마감"
        serverNow={SERVER_NOW}
        onFocusStart={vi.fn()}
      />,
    );

    expect(paragraph("지금 공부하면 랭킹 진입")).toBeInTheDocument();
    expect(screen.queryByText("지금 시작하면", { exact: false })).toBeNull();
    expect(screen.getByRole("button", { name: "순공 시작" })).toBeInTheDocument();
  });

  it("지금 구간이 아닌 시간대 판은 그 구간에 공부하면 순위가 생긴다고 말하고 순위를 보이지 않는다", () => {
    render(
      <ResetCard
        board={EVENING_RESET}
        deadline="00시 마감"
        serverNow={SERVER_NOW}
        onFocusStart={vi.fn()}
      />,
    );

    expect(paragraph("저녁에 공부하면 랭킹 진입")).toBeInTheDocument();
    expect(screen.queryByText(/\d위/)).toBeNull();
    expect(screen.queryByText(/새로 시작됐어요/)).toBeNull();
    expect(screen.getByRole("button", { name: "순공 시작" })).toBeInTheDocument();
  });

  it("지금 구간인 시간대 판은 지금 시작하면 몇 위인지 그대로 말한다", () => {
    render(
      <ResetCard
        board={{ ...EVENING_RESET, slot: "AFTERNOON", startNowRank: 2 }}
        deadline="00시 마감"
        serverNow={SERVER_NOW}
        onFocusStart={vi.fn()}
      />,
    );

    expect(paragraph("지금 시작하면 2위")).toBeInTheDocument();
  });

  it("지금 시작하면 받을 순위가 오지 않으면 순위를 지어내지 않고 첫 공부 문구를 쓴다", () => {
    render(
      <ResetCard
        board={{ ...FIXTURE_RESET_DAILY, startNowRank: null }}
        deadline="00시 마감"
        serverNow={SERVER_NOW}
        onFocusStart={vi.fn()}
      />,
    );

    expect(paragraph("지금 공부하면 랭킹 진입")).toBeInTheDocument();
    expect(screen.queryByText(/\d위/)).toBeNull();
    expect(screen.queryByText(/새로 시작됐어요/)).toBeNull();
    expect(screen.getByRole("button", { name: "순공 시작" })).toBeInTheDocument();
  });

  it("제목은 화면에 보이지 않고 카드 이름으로만 읽힌다", () => {
    render(
      <ResetCard
        board={FIXTURE_RESET_DAILY}
        deadline="00시 마감"
        serverNow={SERVER_NOW}
        onFocusStart={vi.fn()}
      />,
    );

    const heading = screen.getByRole("heading", { name: "순공 · 일간" });
    expect(heading).toHaveClass("sr-only");
    expect(screen.getByRole("region", { name: "순공 · 일간" })).toBeInTheDocument();
  });
});

describe("PreviousResultCard", () => {
  it("직전 기간 최종 순위와 값을 보이고 기록 보기로 간다", async () => {
    const onShowRecords = vi.fn();
    render(<PreviousResultCard previous={FIXTURE_RESET_PREVIOUS} onShowRecords={onShowRecords} />);

    const card = screen.getByRole("region", { name: "어제 최종 결과" });
    expect(within(card).getByText("1,240위 · 7시간 12분")).toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: "기록 보기 ›" }));
    expect(onShowRecords).toHaveBeenCalledTimes(1);
  });
});

describe("FirstCard", () => {
  it("지금 공부하면 순위가 생긴다고 말한다", () => {
    render(
      <FirstCard
        board={FIXTURE_FIRST}
        deadline="마감 1일 9시간"
        serverNow={SERVER_NOW}
        onFocusStart={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "아직 내 순위가 없어요" })).toBeInTheDocument();
    expect(paragraph("지금 공부하면 랭킹 진입")).toBeInTheDocument();
    expect(screen.queryByText(/겨루고 있어요/)).toBeNull();
    expect(screen.getByRole("button", { name: "순공 시작" })).toHaveClass("rounded-full");
  });

  it("지금 구간이 아닌 시간대 판은 그 구간에 공부하면 순위가 생긴다고 말한다", () => {
    render(
      <FirstCard
        board={{ ...FIXTURE_FIRST, type: "TIME_SLOT", period: "DAILY", slot: "EVENING" }}
        deadline="00시 마감"
        serverNow={SERVER_NOW}
        onFocusStart={vi.fn()}
      />,
    );

    expect(paragraph("저녁에 공부하면 랭킹 진입")).toBeInTheDocument();
    expect(screen.queryByText("지금 공부하면", { exact: false })).toBeNull();
  });

  it("연속 공부 판은 10분 기준을 말한다", () => {
    render(
      <FirstCard
        board={{ ...FIXTURE_FIRST, type: "MAX_STREAK", period: null, slot: null }}
        deadline={null}
        serverNow={SERVER_NOW}
        onFocusStart={vi.fn()}
      />,
    );

    expect(paragraph("10분 이상 공부하면랭킹 진입")).toBeInTheDocument();
    expect(screen.queryByText("지금 공부하면", { exact: false })).toBeNull();
  });
});

/** 서버가 보내는 모양 그대로다(상위 1·5·10·20·30·50%, 오름차순). */
const BACKEND_EXAMPLES: RankingGoalExample[] = [
  { percent: 1, value: 90000 },
  { percent: 5, value: 54000 },
  { percent: 10, value: 43200 },
  { percent: 20, value: 28800 },
  { percent: 30, value: 18000 },
  { percent: 50, value: 10800 },
];

describe("GoalExamplesCard", () => {
  it("구간마다 필요한 순공을 분까지 줄로 보인다", () => {
    render(<GoalExamplesCard examples={FIXTURE_FIRST.goalExamples!} />);

    expect(screen.getByRole("heading", { name: "이번 주에 이만큼 하면" })).toHaveClass("sr-only");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "3시간 27분상위 50%까지",
      "8시간상위 20%까지",
      "15시간상위 5%까지",
    ]);
  });

  it("서버가 보낸 여섯 구간 중 50·20·5%만 이 순서로 보인다", () => {
    render(<GoalExamplesCard examples={BACKEND_EXAMPLES} />);

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "3시간상위 50%까지",
      "8시간상위 20%까지",
      "15시간상위 5%까지",
    ]);
  });

  it("빠진 구간은 건너뛴다", () => {
    render(
      <GoalExamplesCard examples={BACKEND_EXAMPLES.filter((example) => example.percent !== 20)} />,
    );

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "3시간상위 50%까지",
      "15시간상위 5%까지",
    ]);
  });

  it("예시가 없으면 그리지 않는다", () => {
    const { container } = render(<GoalExamplesCard examples={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
