import { describe, expect, it } from "vitest";

import { podiumStands } from "../podium";

const mascot = { mascotCode: "BOOK", accessories: [] };

function entry(rank: number, extra: object = {}) {
  return { rank, nickname: `n${rank}`, value: 100, focusing: false, me: false, ...extra };
}

describe("podiumStands의 마스코트", () => {
  it("서버가 준 마스코트를 그 자리 줄에 싣고, 없으면 열쇠를 만들지 않는다", () => {
    const stands = podiumStands({ podium: [entry(1, { mascot }), entry(2)] }, 0);

    expect(stands[0].row?.mascot).toEqual(mascot);
    expect(stands[1].row).not.toHaveProperty("mascot");
  });
});
