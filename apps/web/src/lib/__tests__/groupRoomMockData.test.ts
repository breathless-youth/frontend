import { describe, expect, it } from "vitest";

import { seedGroupData, seedGroupWorld } from "../groupRoomMockData";

const NOW = Date.parse("2026-11-03T10:00:00+09:00");

describe("가짜 서버 공개 그룹 주간 합계", () => {
  it("카드와 상세가 멤버들의 이번 주 순공 합을 싣는다", () => {
    const world = seedGroupWorld("default", NOW);
    const seed = seedGroupData("default", NOW);
    for (const card of seed.publicGroups) {
      const group = world.groups.find((candidate) => candidate.groupId === card.groupId)!;
      const total = group.members.reduce((sum, member) => sum + member.weekFocusSec, 0);
      expect(card.weeklyTotalFocusSec).toBe(total);
      expect(seed.publicDetails[card.groupId]!.weeklyTotalFocusSec).toBe(total);
    }
  });

  it("다 차지 않은 그룹이 먼저이고 그 안에서 주간 합계가 많은 순이다", () => {
    const cards = seedGroupData("default", NOW).publicGroups;
    const open = cards.filter((card) => card.memberCount < 6);
    expect(cards.slice(0, open.length)).toEqual(open);
    const totals = open.map((card) => card.weeklyTotalFocusSec);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
  });
});
