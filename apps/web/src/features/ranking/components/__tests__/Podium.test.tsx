import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  FIXTURE_FIRST_PLACE,
  FIXTURE_FOCUS_WEEKLY,
  FIXTURE_RESET_DAILY,
  FIXTURE_SLOT_DAILY,
  FIXTURE_STREAK,
  FIXTURE_TOTAL_DAYS,
  FIXTURE_TOTAL_TIME,
} from "@/lib/rankingFixtures";

import { Podium } from "../Podium";

describe("Podium", () => {
  it("판에 맞는 제목과 오른쪽 글을 단다", () => {
    render(<Podium board={FIXTURE_SLOT_DAILY} elapsedSec={0} />);

    expect(screen.getByRole("heading", { name: "오전 구간 TOP 3" })).toBeInTheDocument();
    expect(screen.getByText("오늘 7–12시")).toBeInTheDocument();
  });

  it("목록은 순위 순서이고 집중 중이면 보간 값과 표시를 단다", () => {
    render(<Podium board={FIXTURE_FOCUS_WEEKLY} elapsedSec={20} />);

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("1위");
    expect(items[0]).toHaveTextContent("새벽공부러");
    expect(items[0]).toHaveTextContent("집중 중31:13:00");
    expect(items[1]).toHaveTextContent("합격까지달린다");
    expect(items[1]).toHaveTextContent("29:48:10");
    expect(items[2]).toHaveTextContent("집중 중28:55:22");
  });

  it("빈자리는 ?로 둔다", () => {
    render(
      <Podium
        board={{ ...FIXTURE_TOTAL_TIME, podium: FIXTURE_TOTAL_TIME.podium.slice(0, 1) }}
        elapsedSec={0}
      />,
    );

    expect(screen.getAllByText("?")).toHaveLength(4);
    // 빈자리에는 메달색 테를 두르지 않는다.
    const [filled, ...empty] = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(filled!.querySelector("[data-medal-ring]")).toHaveAttribute("data-medal-ring", "1");
    for (const item of empty) {
      expect(item.querySelector("[data-medal-ring]")).toBeNull();
    }
    // 한 사람씩인 시상대는 순위가 자리 번호와 같아 빈자리도 자리 번호로 읽는다.
    expect(within(empty[0]!).getByText("2위")).toBeInTheDocument();
    expect(within(empty[1]!).getByText("3위")).toBeInTheDocument();
  });

  it("모든 자리가 빈 시상대도 자리마다 값 줄 자리를 비워 두어 카드 높이가 같다", () => {
    render(<Podium board={{ ...FIXTURE_FOCUS_WEEKLY, podium: [] }} elapsedSec={0} />);

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    for (const item of items) {
      const placeholder = item.querySelector("[data-value-placeholder]");
      expect(placeholder).not.toBeNull();
      expect(placeholder).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("사람이 선 자리에는 값 줄 자리표시를 두지 않는다", () => {
    render(<Podium board={FIXTURE_FOCUS_WEEKLY} elapsedSec={0} />);

    for (const item of within(screen.getByRole("list")).getAllByRole("listitem")) {
      expect(item.querySelector("[data-value-placeholder]")).toBeNull();
    }
  });

  it("메달을 받은 자리는 아바타를 그 자리 메달과 같은 색 테로 두른다", () => {
    render(<Podium board={FIXTURE_FOCUS_WEEKLY} elapsedSec={0} />);

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    const strokes = items.map((item, index) => {
      const ring = item.querySelector("[data-medal-ring]");
      expect(ring).toHaveAttribute("data-medal-ring", String(index + 1));
      // 메달은 자리 맨 아래 받침에 있어 마지막 그림이다.
      const medal = [...item.querySelectorAll("svg")].at(-1)!;
      const stroke = ring!.querySelector("circle")!.getAttribute("stroke");
      // 은색은 채움색이 연한 배경에 묻혀서 메달 테두리색을 쓴다.
      const medalCircle = medal.querySelector("circle")!;
      expect(stroke).toBe(medalCircle.getAttribute(index === 1 ? "stroke" : "fill"));
      return stroke;
    });
    expect(new Set(strokes).size).toBe(3);
  });

  it("내 자리는 보이는 나 표시 없이 내 첫 글자의 파란 아바타를 두고 화면 낭독기에만 나라고 알린다", () => {
    render(<Podium board={FIXTURE_FIRST_PLACE} elapsedSec={0} />);

    const first = within(screen.getByRole("list")).getAllByRole("listitem")[0]!;
    expect(first).toHaveTextContent("오늘도출석나");
    const avatar = within(first).getByText("오", { selector: "[aria-hidden='true']" });
    expect(avatar).toHaveAttribute("data-me");
    expect(within(first).queryByText("나", { selector: "[aria-hidden='true']" })).toBeNull();
    // 아바타 글자는 화면 낭독기에서 숨기므로 남는 나는 화면에 보이지 않는 글자 하나뿐이다.
    expect(within(first).getByText("나", { ignore: "[aria-hidden='true']" })).toHaveClass(
      "sr-only",
    );
  });

  it("30분이 안 된 자리는 메달도 원도 없이 순위 숫자만 두고 안내 한 줄을 단다", () => {
    render(<Podium board={FIXTURE_RESET_DAILY} elapsedSec={0} />);

    expect(screen.getByText("메달은 30분 이상부터 받아요")).toBeInTheDocument();
    const [first, second] = within(screen.getByRole("list")).getAllByRole("listitem");
    // 원은 메달 크기의 폭과 높이로 그렸으므로, 숫자만 남으면 크기를 따로 주지 않는다.
    expect(within(second!).getByText("2", { selector: "span" })).not.toHaveStyle({
      width: "18px",
      height: "18px",
    });
    expect(second!.querySelector("svg")).toBeNull();
    expect(second!.querySelector("[data-medal-ring]")).toBeNull();
    expect(within(first!).queryByText("1", { selector: "span" })).toBeNull();
    expect(first!.querySelector("[data-medal-ring]")).toHaveAttribute("data-medal-ring", "1");
  });

  it("명예의 전당에는 30분 안내를 달지 않는다", () => {
    render(
      <Podium
        board={{ ...FIXTURE_TOTAL_TIME, podium: [{ ...FIXTURE_TOTAL_TIME.podium[0]!, value: 10 }] }}
        elapsedSec={0}
      />,
    );

    expect(screen.queryByText("메달은 30분 이상부터 받아요")).toBeNull();
  });

  describe("일수 판", () => {
    it("묶음마다 대표 이름, 외 N명, 일수를 순위 순서로 두고 자리마다 메달색 테를 두른다", () => {
      render(<Podium board={FIXTURE_STREAK} elapsedSec={0} />);

      const items = within(screen.getByRole("list")).getAllByRole("listitem");
      expect(items).toHaveLength(3);
      // 화면 낭독기는 자리 번호가 아니라 묶음의 공동 순위를 읽는다.
      expect(within(items[0]!).getByText("1위")).toBeInTheDocument();
      expect(items[0]).toHaveTextContent("새벽러너외 2명186일");
      expect(within(items[1]!).getByText("4위")).toBeInTheDocument();
      expect(items[1]).toHaveTextContent("합격기원외 1명171일");
      expect(within(items[2]!).getByText("6위")).toBeInTheDocument();
      expect(items[2]).toHaveTextContent("오답노트외 4명158일");
      items.forEach((item, index) => {
        expect(item.querySelector("[data-medal-ring]")).toHaveAttribute(
          "data-medal-ring",
          String(index + 1),
        );
      });
    });

    it("혼자인 묶음은 외 N명 줄을 두지 않는다", () => {
      render(<Podium board={FIXTURE_TOTAL_DAYS} elapsedSec={0} />);

      const [first, second] = within(screen.getByRole("list")).getAllByRole("listitem");
      expect(first).toHaveTextContent("도서관지박령외 2명412일");
      expect(second).toHaveTextContent("합격기원388일");
      expect(second).not.toHaveTextContent(/외 .*명/);
    });

    it("내 묶음은 내 이름과 파란 내 아바타를 세우고 화면 낭독기에만 나라고 알린다", () => {
      const [top, mine, third] = FIXTURE_STREAK.podiumGroups!;
      render(
        <Podium
          board={{
            ...FIXTURE_STREAK,
            podiumGroups: [
              top!,
              { ...mine!, nickname: "오늘도출석", me: true, myOrder: 2 },
              third!,
            ],
          }}
          elapsedSec={0}
        />,
      );

      const second = within(screen.getByRole("list")).getAllByRole("listitem")[1]!;
      expect(second).toHaveTextContent("오늘도출석나외 1명171일");
      // 시상대의 내 아바타는 나 대신 내 첫 글자를 쓰는 파란 원이고 화면 낭독기에서는 숨긴다.
      const avatar = within(second).getByText("오", { selector: "[aria-hidden='true']" });
      expect(avatar).toHaveAttribute("data-me");
      expect(within(second).queryByText("나", { selector: "[aria-hidden='true']" })).toBeNull();
      expect(within(second).getByText("나", { ignore: "[aria-hidden='true']" })).toHaveClass(
        "sr-only",
      );
    });

    it("묶음이 3개보다 적으면 빈자리는 ?로 둔다", () => {
      render(
        <Podium
          board={{
            ...FIXTURE_TOTAL_DAYS,
            podiumGroups: FIXTURE_TOTAL_DAYS.podiumGroups!.slice(0, 1),
          }}
          elapsedSec={0}
        />,
      );

      expect(screen.getAllByText("?")).toHaveLength(4);
      const [filled, ...empty] = within(screen.getByRole("list")).getAllByRole("listitem");
      expect(filled).toHaveTextContent("도서관지박령외 2명412일");
      for (const item of empty) {
        expect(item.querySelector("[data-medal-ring]")).toBeNull();
        // 공동 순위와 겹치지 않게 빈자리는 자리 번호 대신 빈자리라고 읽는다.
        expect(within(item).getByText("빈자리")).toBeInTheDocument();
        expect(item).not.toHaveTextContent(/\d위/);
      }
    });

    it.each([
      ["undefined", undefined],
      ["null", null],
    ])(
      "묶음이 없는 배포 전 응답(podiumGroups가 %s)은 podium의 1·2·3위를 그대로 세운다",
      (_, podiumGroups) => {
        const person = (rank: number, nickname: string, value: number) => ({
          rank,
          nickname,
          value,
          focusing: false,
          me: false,
        });
        render(
          <Podium
            board={{
              ...FIXTURE_TOTAL_DAYS,
              podiumGroups,
              podium: [
                person(1, "도서관지박령", 412),
                person(2, "합격기원", 388),
                person(3, "공시생J", 351),
              ],
            }}
            elapsedSec={0}
          />,
        );

        const items = within(screen.getByRole("list")).getAllByRole("listitem");
        expect(within(items[0]!).getByText("1위")).toBeInTheDocument();
        expect(items[0]).toHaveTextContent("도서관지박령412일");
        expect(within(items[1]!).getByText("2위")).toBeInTheDocument();
        expect(items[1]).toHaveTextContent("합격기원388일");
        expect(within(items[2]!).getByText("3위")).toBeInTheDocument();
        expect(items[2]).toHaveTextContent("공시생J351일");
        expect(screen.getByRole("list")).not.toHaveTextContent(/외 .*명/);
      },
    );
  });
});
