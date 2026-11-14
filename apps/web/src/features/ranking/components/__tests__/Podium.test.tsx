import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { stubImageLoad } from "@/test/imageStub";

import { Podium } from "../Podium";

describe("Podium", () => {
  it("제목은 숨기고 시간대 판에만 기준 툴팁을 둔다", async () => {
    render(<Podium board={FIXTURE_SLOT_DAILY} elapsedSec={0} />);

    expect(screen.getByRole("heading", { name: "아침 구간 TOP 3" })).toHaveClass("sr-only");
    expect(screen.queryByText("오늘 6–12시")).toBeNull();
    // 웹뷰 탭처럼 pointerdown 뒤 click을 보낸다.
    // userEvent는 포커스까지 옮겨 jsdom에서 포커스로 열린 툴팁을 click이 바로 닫는다.
    const trigger = screen.getByRole("button", { name: "TOP 3 기준 안내" });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(await screen.findAllByText("오늘 6–12시 순공시간 기준")).not.toHaveLength(0);
  });

  it("순공 판에는 툴팁이 없다", () => {
    render(<Podium board={FIXTURE_FOCUS_WEEKLY} elapsedSec={0} />);
    expect(screen.queryByRole("button", { name: "TOP 3 기준 안내" })).toBeNull();
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

  it("빈자리는 아바타 자리에만 순위별 실루엣을 둔다", () => {
    render(
      <Podium
        board={{ ...FIXTURE_TOTAL_TIME, podium: FIXTURE_TOTAL_TIME.podium.slice(0, 1) }}
        elapsedSec={0}
      />,
    );

    expect(screen.queryByText("?")).toBeNull();
    // 빈자리에는 메달색 테를 두르지 않는다.
    const [filled, ...empty] = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(filled!.querySelector("[data-empty-silhouette]")).toBeNull();
    expect(
      empty.map((item) =>
        item.querySelector("[data-empty-silhouette]")?.getAttribute("data-empty-silhouette"),
      ),
    ).toEqual(["planner", "pencil"]);
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
    expect(items[0]!.querySelector("[data-empty-silhouette]")).toHaveAttribute(
      "data-empty-silhouette",
      "stopwatch",
    );
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

  it("내 자리는 보이는 나 표시 없이 파란 바탕 마스코트 아바타를 두고 화면 낭독기에만 나라고 알린다", () => {
    render(<Podium board={FIXTURE_FIRST_PLACE} elapsedSec={0} />);

    const first = within(screen.getByRole("list")).getAllByRole("listitem")[0]!;
    expect(first).toHaveTextContent("오늘도출석나");
    const avatar = first.querySelector("[data-me]");
    expect(avatar).toHaveAttribute("aria-hidden", "true");
    expect(avatar?.querySelector("[data-default-mascot]")).not.toBeNull();
    expect(
      within(first).queryByText("나", { selector: "[aria-hidden='true'], [aria-hidden='true'] *" }),
    ).toBeNull();
    // 아바타는 화면 낭독기에서 숨기므로 남는 나는 화면에 보이지 않는 글자 하나뿐이다.
    expect(within(first).getByText("나", { ignore: "[aria-hidden='true']" })).toHaveClass(
      "sr-only",
    );
  });

  it("30분이 안 된 자리는 메달도 원도 없이 순위 숫자만 두고 안내 줄은 달지 않는다", () => {
    render(<Podium board={FIXTURE_RESET_DAILY} elapsedSec={0} />);

    expect(screen.queryByText("메달은 30분 이상부터 받아요")).toBeNull();
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
    it("사람마다 한 자리로 이름과 일수를 순위 순서로 세우고 자리 번호로 읽는다", () => {
      render(<Podium board={FIXTURE_STREAK} elapsedSec={0} />);

      const items = within(screen.getByRole("list")).getAllByRole("listitem");
      expect(items).toHaveLength(3);
      expect(within(items[0]!).getByText("1위")).toBeInTheDocument();
      expect(items[0]).toHaveTextContent("새벽러너186일");
      expect(within(items[1]!).getByText("2위")).toBeInTheDocument();
      expect(items[1]).toHaveTextContent("합격기원171일");
      expect(within(items[2]!).getByText("3위")).toBeInTheDocument();
      expect(items[2]).toHaveTextContent("오답노트158일");
      expect(screen.queryByText(/외 .*명/)).toBeNull();
      items.forEach((item, index) => {
        expect(item.querySelector("[data-medal-ring]")).toHaveAttribute(
          "data-medal-ring",
          String(index + 1),
        );
      });
    });

    it("내 자리는 내 이름과 파란 내 아바타를 세우고 화면 낭독기에만 나라고 알린다", () => {
      const [top, mine, third] = FIXTURE_STREAK.podium;
      render(
        <Podium
          board={{
            ...FIXTURE_STREAK,
            podium: [top!, { ...mine!, nickname: "오늘도출석", me: true }, third!],
          }}
          elapsedSec={0}
        />,
      );

      const second = within(screen.getByRole("list")).getAllByRole("listitem")[1]!;
      expect(second).toHaveTextContent("오늘도출석나171일");
      // 시상대의 내 아바타는 마스코트를 그린 파란 원이고 화면 낭독기에서는 숨긴다.
      const avatar = second.querySelector("[data-me]");
      expect(avatar).toHaveAttribute("aria-hidden", "true");
      expect(avatar?.querySelector("[data-default-mascot]")).not.toBeNull();
      expect(within(second).getByText("나", { ignore: "[aria-hidden='true']" })).toHaveClass(
        "sr-only",
      );
    });

    it("3명보다 적으면 빈자리는 아바타 자리에만 실루엣을 두고 자리 번호로 읽는다", () => {
      render(
        <Podium
          board={{ ...FIXTURE_TOTAL_DAYS, podium: FIXTURE_TOTAL_DAYS.podium.slice(0, 1) }}
          elapsedSec={0}
        />,
      );

      expect(screen.queryByText("?")).toBeNull();
      expect(document.querySelectorAll("[data-empty-silhouette]")).toHaveLength(2);
      const [filled, second, third] = within(screen.getByRole("list")).getAllByRole("listitem");
      expect(filled).toHaveTextContent("도서관지박령412일");
      expect(within(second!).getByText("2위")).toBeInTheDocument();
      expect(within(third!).getByText("3위")).toBeInTheDocument();
    });
  });

  it("사진이 있는 자리는 마스코트 대신 사진을 그린다", async () => {
    stubImageLoad();
    const [first, ...rest] = FIXTURE_FOCUS_WEEKLY.podium;
    render(
      <Podium
        board={{
          ...FIXTURE_FOCUS_WEEKLY,
          podium: [{ ...first!, profileImageUrl: "/avatars/1.jpg" }, ...rest],
        }}
        elapsedSec={0}
      />,
    );

    const [spot1, spot2] = within(screen.getByRole("list")).getAllByRole("listitem");
    await waitFor(() =>
      expect(spot1!.querySelector("img")).toHaveAttribute("src", "/avatars/1.jpg"),
    );
    expect(spot1!.querySelector("[data-default-mascot]")).toBeNull();
    expect(spot2!.querySelector("[data-default-mascot]")).not.toBeNull();
  });

  it("일수 판도 사진을 그린다", async () => {
    stubImageLoad();
    const [first, ...rest] = FIXTURE_TOTAL_DAYS.podium;
    render(
      <Podium
        board={{
          ...FIXTURE_TOTAL_DAYS,
          podium: [{ ...first!, profileImageUrl: "/avatars/2.jpg" }, ...rest],
        }}
        elapsedSec={0}
      />,
    );

    const [spot1] = within(screen.getByRole("list")).getAllByRole("listitem");
    await waitFor(() =>
      expect(spot1!.querySelector("img")).toHaveAttribute("src", "/avatars/2.jpg"),
    );
  });
});
