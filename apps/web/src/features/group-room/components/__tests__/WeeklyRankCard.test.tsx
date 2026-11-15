import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import timiAvatar from "@/assets/mascot/timi-avatar.png";
import lamp from "@/assets/points/mascot-lamp.png";
import { __resetPointsForTests } from "@/lib/pointsCapability";

import { IGNORE_ARIA_HIDDEN } from "../../__tests__/renderScreen";
import { buildGroupRoomFixtures } from "../../fixtures";
import { WeeklyRankCard } from "../WeeklyRankCard";

const fixtures = buildGroupRoomFixtures(new Date("2026-11-02T10:00:00+09:00"));
const rows = fixtures.roomHome.weeklyRanks;

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name, { ignore: IGNORE_ARIA_HIDDEN }).closest("li");
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

describe("WeeklyRankCard", () => {
  it("순위, 닉네임, 이번 주 순공을 순위 순서로 보이고 내 줄만 표시한다", () => {
    render(<WeeklyRankCard rows={rows} elapsedSec={0} />);
    const items = within(screen.getByRole("region", { name: "이번 주 순위" })).getAllByRole(
      "listitem",
    );
    expect(items).toHaveLength(rows.length);
    expect(within(items[0]!).getByText("1")).toBeInTheDocument();
    expect(within(items[0]!).getByText("새벽러")).toBeInTheDocument();
    expect(within(items[0]!).getByText("21:40:10")).toBeInTheDocument();
    expect(items.filter((item) => item.hasAttribute("data-me"))).toEqual([rowOf("열공곰")]);
    expect(within(rowOf("열공곰")).getByText("12:40:00")).toBeInTheDocument();
  });

  it("순공이 쌓이는 줄은 흐른 시간만큼 올리되 바로 위 줄을 넘지 않는다", () => {
    render(<WeeklyRankCard rows={rows} elapsedSec={5 * 3600} />);
    expect(within(rowOf("새벽러")).getByText("26:40:10")).toBeInTheDocument();
    expect(within(rowOf("합격까지")).getByText("23:02:33")).toBeInTheDocument();
    expect(within(rowOf("열공곰")).getByText("12:40:00")).toBeInTheDocument();
    // 고구마맛탕은 올리면 14:15:20이지만 순위는 다시 받을 때만 바뀌어 바로 위 줄에서 멈춘다.
    expect(within(rowOf("고구마맛탕")).getByText("12:40:00")).toBeInTheDocument();
    expect(within(rowOf("연필깎이")).getByText("4:02:11")).toBeInTheDocument();
  });

  it("공부 중인 줄은 점과 함께 화면 낭독기에 공부 중이라고 알린다", () => {
    render(<WeeklyRankCard rows={rows} elapsedSec={0} />);
    expect(within(rowOf("새벽러")).getByText("공부 중")).toBeInTheDocument();
    expect(within(rowOf("연필깎이")).queryByText("공부 중")).toBeNull();
  });

  describe("고른 마스코트", () => {
    const withMascot = rows.map((row, index) =>
      index === 0
        ? {
            ...row,
            imageUrl: null,
            mascot: {
              mascotCode: "LAMP",
              accessories: [
                {
                  mascotCode: "LAMP",
                  slot: "FACE",
                  item: { itemId: 1, code: "glasses", imageUrl: "/glasses.png" },
                },
              ],
            },
          }
        : row,
    );

    afterEach(() => {
      window.history.replaceState(null, "", "/");
      __resetPointsForTests();
    });

    it("포인트를 연 곳에서는 사진이 없는 줄에 그 사람이 고른 마스코트와 소품을 그린다", () => {
      window.history.replaceState(null, "", "/?points=1");
      __resetPointsForTests();
      render(<WeeklyRankCard rows={withMascot} elapsedSec={0} />);

      const row = rowOf("새벽러");
      expect(row.querySelector("[data-slot='mascot-body'] img")).toHaveAttribute("src", lamp);
      expect(row.querySelector("[data-slot='accessory-face']")).toHaveAttribute(
        "src",
        "/glasses.png",
      );
    });

    it("포인트를 열지 않은 곳에서는 지금 기본 그림을 그린다", () => {
      __resetPointsForTests();
      render(<WeeklyRankCard rows={withMascot} elapsedSec={0} />);

      const row = rowOf("새벽러");
      expect(row.querySelector("[data-slot='mascot-body']")).toBeNull();
      expect(row.querySelector("img[data-default-mascot]")).toHaveAttribute("src", timiAvatar);
    });
  });
});
