import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WeekCards } from "../WeekCards";

const day = (date: string, focusSec: number, studySec: number) => ({ date, studySec, focusSec });
const H = 3600;

describe("WeekCards", () => {
  it("이 주 최고 기록과 공부한 날 기준 평균, 평균 집중률을 보여준다", () => {
    render(
      <WeekCards
        daily={[
          day("2026-09-14", 6 * H, 7 * H),
          day("2026-09-15", 0, 0),
          day("2026-09-16", 2 * H, 3 * H),
        ]}
      />,
    );

    expect(screen.getByText("이 주 최고 기록").parentElement).toHaveTextContent(
      "6시간9월 14일 월요일",
    );
    // 순공 8시간 ÷ 공부한 2일 = 4시간, 총 공부 10시간 ÷ 2일 = 5시간, 집중률 8 ÷ 10 = 80%.
    expect(screen.getByText("하루 평균").parentElement).toHaveTextContent("4시간공부한 2일 기준");
    expect(screen.getByText("하루 평균 공부시간").parentElement).toHaveTextContent("5시간");
    expect(screen.getByText("평균 집중률").parentElement).toHaveTextContent("80%");
  });

  it("기록 없는 주는 값을 —로 적는다", () => {
    render(<WeekCards daily={[day("2026-09-14", 0, 0)]} />);

    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.getByText("아직 공부한 날이 없어요")).toBeInTheDocument();
    expect(screen.getByText("공부한 날 없음")).toBeInTheDocument();
  });
});
