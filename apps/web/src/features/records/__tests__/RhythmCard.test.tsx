import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";

import { RhythmCard } from "../RhythmCard";
import type { RhythmState } from "../useWeeklyData";

const zeroGrid = () => Array.from({ length: 7 }, () => Array<number>(24).fill(0));

/** 14일 전 — 카드는 샘플을 그린다. */
const BEFORE_14_DAYS: RhythmState = {
  status: "success",
  data: { studyDays: 3, focusSecByWeekdayHour: zeroGrid() },
};

/** 22일 공부, 화·목 20~22시에 몰린 기록 — 카드는 내 히트맵과 `저녁 8~10시` 문장을 그린다. */
function mine(): RhythmState {
  const grid = zeroGrid();
  grid[1]![20] = 3600;
  grid[1]![21] = 2400;
  grid[3]![20] = 3000;
  grid[3]![21] = 3600;
  grid[5]![14] = 1800;
  return { status: "success", data: { studyDays: 22, focusSecByWeekdayHour: grid } };
}

describe("RhythmCard — 14일 전 예상 화면", () => {
  it("제목과 준비 중 칩, 샘플 안내 문구를 보여준다", () => {
    render(<RhythmCard rhythm={BEFORE_14_DAYS} />);

    expect(screen.getByRole("heading", { name: "나의 공부 리듬" })).toBeInTheDocument();
    expect(screen.getByText("집중 리포트 준비 중")).toBeInTheDocument();
    expect(screen.getByText("기록이 쌓이면 표시돼요")).toBeInTheDocument();
    expect(screen.getByText("지금은 샘플 데이터가 표시돼요")).toBeInTheDocument();
  });

  it("예시 히트맵(요일 7 × 시간 24)은 장식이라 보조 기술에서 숨긴다", () => {
    const { container } = render(<RhythmCard rhythm={BEFORE_14_DAYS} />);

    const ghost = container.querySelector('[aria-hidden="true"]');
    expect(ghost).not.toBeNull();
    expect(ghost?.querySelectorAll("span.h-3\\.25")).toHaveLength(7 * 24);
    // 가로축은 5시에서 시작해 다음 날 4시에서 끝난다 — 눈금 5 · 11 · 17 · 23 · 4.
    expect(ghost).toHaveTextContent("51117234");
    // 안내 문구는 장식 밖에 있어 읽힌다.
    expect(ghost).not.toHaveTextContent("샘플");
  });

  it("조회에 실패해도 샘플로 되돌아간다", () => {
    render(<RhythmCard rhythm={{ status: "error" }} />);

    expect(screen.getByText("기록이 쌓이면 표시돼요")).toBeInTheDocument();
  });

  it("조회 중에는 자리표시만 두고 샘플 문구를 먼저 보여주지 않는다", () => {
    render(<RhythmCard rhythm={{ status: "pending" }} />);

    expect(screen.getByRole("heading", { name: "나의 공부 리듬" })).toBeInTheDocument();
    expect(screen.queryByText("기록이 쌓이면 표시돼요")).not.toBeInTheDocument();
  });
});

describe("RhythmCard — 14일부터 내 리듬", () => {
  it("칩을 떼고 가장 많이 공부한 2시간 문장과 누적 공부일을 적는다", () => {
    render(<RhythmCard rhythm={mine()} />);

    expect(screen.getByText("저녁 8~10시에 집중했어요")).toBeInTheDocument();
    expect(screen.getByText("22일 동안 집중한 시간을 모았어요")).toBeInTheDocument();
    expect(screen.queryByText("집중 리포트 준비 중")).not.toBeInTheDocument();
    expect(screen.queryByText("기록이 쌓이면 표시돼요")).not.toBeInTheDocument();
  });

  it("내 히트맵은 흐리지 않고, 문장이 가리키는 2시간(20~22시 = 16번째 칸부터)에 테두리를 두른다", () => {
    render(<RhythmCard rhythm={mine()} />);

    const card = screen.getByTestId("rhythm-mine");
    const heatmap = card.querySelector('[aria-hidden="true"]');
    expect(heatmap).not.toHaveClass("blur-[0.8px]");
    expect(heatmap?.querySelectorAll("span.h-3\\.25")).toHaveLength(7 * 24);
    // 목요일 21시(가장 진한 칸)는 5단계, 토요일 14시는 3단계(1800/3600 → ceil(2.5)).
    const rows = heatmap!.querySelectorAll(".flex.gap-0\\.5");
    expect(rows[3]!.children[16]).toHaveClass("bg-chart-heat-5");
    expect(rows[5]!.children[9]).toHaveClass("bg-chart-heat-3");

    // 칸 폭은 (전체 - 간격 23개) / 24이고 칸마다 간격 2px가 붙는다. jsdom이 calc 식을 고쳐 쓰므로
    // 모양만 본다 — 15번째 칸부터, 간격 46px을 뺀 폭 기준.
    const band = screen.getByTestId("rhythm-peak-band");
    expect(band.style.left).toMatch(/15 \*/);
    expect(band.style.left).toMatch(/46px/);
    expect(band.style.width).toMatch(/2 \*/);
    expect(band.style.width).toMatch(/46px/);
  });
});

describe("RhythmCard — 영어", () => {
  afterEach(async () => {
    await i18n.changeLanguage("ko");
    vi.restoreAllMocks();
  });

  it("요일 열은 한 글자(M T W T F S S)이고 같은 글자가 겹쳐도 key 경고가 없다", async () => {
    await i18n.changeLanguage("en");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container } = render(<RhythmCard rhythm={BEFORE_14_DAYS} />);

    const ghost = container.querySelector('[aria-hidden="true"]');
    expect(ghost).toHaveTextContent(/^MTWTFSS/);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("구간은 12시간 표기 + 하루 구간 이름으로 적는다(AM/PM 없음)", async () => {
    await i18n.changeLanguage("en");
    render(<RhythmCard rhythm={mine()} />);

    expect(screen.getByText("You focused most from 8 to 10 in the evening")).toBeInTheDocument();
    expect(screen.getByText("Built from 22 study days")).toBeInTheDocument();
  });
});
