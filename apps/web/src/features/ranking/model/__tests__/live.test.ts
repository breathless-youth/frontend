import { describe, expect, it } from "vitest";

import {
  FIXTURE_FIRST_PLACE,
  FIXTURE_FOCUS_WEEKLY,
  FIXTURE_OVERTAKEN,
  FIXTURE_RATE_WEEKLY,
  FIXTURE_SLOT_DAILY,
  FIXTURE_TOTAL_DAYS,
} from "@/lib/rankingFixtures";

import {
  advanceLiveTrack,
  hasFocusing,
  interpolateRows,
  liveCapSec,
  liveGap,
  rankCardSubLine,
  rankDrop,
  startLiveTrack,
} from "../live";

describe("보간", () => {
  it("집중 중인 줄만 지난 초만큼 올린다", () => {
    const rows = interpolateRows(FIXTURE_FOCUS_WEEKLY.around, 100);

    expect(rows.map((row) => [row.nickname, row.display])).toEqual([
      ["형광펜", 47460],
      ["커피세잔", 46920],
      ["오늘도출석", 45600],
      ["도서관지박령", 45340],
      ["공시생J", 44380],
    ]);
  });

  it("바로 위 줄 값을 넘지 않는다", () => {
    const rows = interpolateRows(FIXTURE_FOCUS_WEEKLY.around, 1000);

    expect(rows.find((row) => row.nickname === "도서관지박령")!.display).toBe(45600);
    expect(rows.find((row) => row.nickname === "공시생J")!.display).toBe(45280);
  });

  it("순위 순서로 정렬한다", () => {
    const shuffled = [...FIXTURE_FOCUS_WEEKLY.around].reverse();

    expect(interpolateRows(shuffled, 0).map((row) => row.rank)).toEqual([
      1203, 1204, 1205, 1206, 1207,
    ]);
  });

  it("집중 중인 사람이 하나라도 있는지", () => {
    expect(hasFocusing(FIXTURE_FOCUS_WEEKLY)).toBe(true);
    expect(hasFocusing(FIXTURE_RATE_WEEKLY)).toBe(false);
  });
});

describe("차이", () => {
  const above = { nickname: "A", gap: 600, focusing: true };
  const below = { nickname: "B", gap: 600, focusing: true };

  it("위가 집중 중이면 위까지 차이가 늘고, 아래가 집중 중이면 따라오는 차이가 준다", () => {
    expect(liveGap(above, false, 60, "above")).toBe(660);
    expect(liveGap(below, false, 60, "below")).toBe(540);
  });

  it("나도 집중 중이면 반대로 움직인다", () => {
    expect(liveGap({ ...above, focusing: false }, true, 60, "above")).toBe(540);
    expect(liveGap({ ...below, focusing: false }, true, 60, "below")).toBe(660);
  });

  it("차이는 0 아래로 내려가지 않는다", () => {
    expect(liveGap({ ...above, focusing: false }, true, 900, "above")).toBe(0);
    expect(liveGap(below, false, 900, "below")).toBe(0);
  });

  it("이웃이 없으면 null", () => {
    expect(liveGap(null, false, 10, "above")).toBeNull();
  });
});

describe("내려간 계단 수", () => {
  it("내려간 계단 수를 센다", () => {
    expect(rankDrop(FIXTURE_FOCUS_WEEKLY, FIXTURE_OVERTAKEN)).toBe(3);
  });

  it("순위가 오르거나 그대로면 0이다", () => {
    expect(rankDrop(FIXTURE_OVERTAKEN, FIXTURE_FOCUS_WEEKLY)).toBe(0);
    expect(rankDrop(FIXTURE_OVERTAKEN, FIXTURE_OVERTAKEN)).toBe(0);
  });

  it("내 순위가 없으면 판정하지 않는다", () => {
    expect(rankDrop({ ...FIXTURE_FOCUS_WEEKLY, me: null }, FIXTURE_OVERTAKEN)).toBe(0);
  });
});

/** 픽스처 계산 시각(14시 12분)이라 지금 구간은 점심이다. */
const AFTERNOON_NOW = Date.parse(FIXTURE_FOCUS_WEEKLY.asOf);
const MORNING_NOW = Date.parse("2026-10-10T10:00:00+09:00");

describe("순위 카드 아랫줄", () => {
  const MORNING_NOTICE = {
    text: "아침에 공부한 시간만 이 순위에 들어가요",
    tone: "muted",
  };

  it("바로 위가 집중 중이면 나를 넘어온 사람이 아니어도 차이가 벌어진다고 말한다", () => {
    expect(
      rankCardSubLine({
        board: {
          ...FIXTURE_FOCUS_WEEKLY,
          above: { nickname: "커피세잔", gap: 1320, focusing: true },
        },
        belowGap: 360,
        serverNow: AFTERNOON_NOW,
      }),
    ).toEqual({ text: "앞 순위와 차이가 벌어지고 있어요", tone: "alert" });
  });

  it("바로 위가 집중 중이면 바로 아래가 5분 안에서 따라와도 벌어지는 문구를 먼저 쓴다", () => {
    expect(
      rankCardSubLine({ board: FIXTURE_OVERTAKEN, belowGap: 180, serverNow: AFTERNOON_NOW }),
    ).toEqual({ text: "앞 순위와 차이가 벌어지고 있어요", tone: "alert" });
  });

  it("두 칸 이상 위가 집중 중이어도 바로 위가 집중 중이 아니면 이 문구를 쓰지 않는다", () => {
    const board = {
      ...FIXTURE_FOCUS_WEEKLY,
      around: FIXTURE_FOCUS_WEEKLY.around.map((row) =>
        row.nickname === "형광펜" ? { ...row, focusing: true } : row,
      ),
    };

    expect(board.podium.some((row) => row.focusing)).toBe(true);
    expect(board.above?.focusing).toBe(false);
    expect(rankCardSubLine({ board, belowGap: 360, serverNow: AFTERNOON_NOW })).toEqual({
      text: "한 번 더 공부하면 따라잡을 수 있어요",
      tone: "muted",
    });
  });

  it("바로 아래가 집중 중이고 5분 안이면 같은 경고 색으로 따라온다고 말한다", () => {
    expect(
      rankCardSubLine({ board: FIXTURE_FIRST_PLACE, belowGap: 290, serverNow: MORNING_NOW }),
    ).toEqual({
      text: "뒤 순위와 차이가 줄어들고 있어요",
      tone: "alert",
    });
  });

  it("순공은 한 번 더 공부, 시간대는 구간이 끝나기 전", () => {
    expect(
      rankCardSubLine({ board: FIXTURE_FOCUS_WEEKLY, belowGap: 360, serverNow: AFTERNOON_NOW }),
    ).toEqual({
      text: "한 번 더 공부하면 따라잡을 수 있어요",
      tone: "muted",
    });
    expect(
      rankCardSubLine({ board: FIXTURE_SLOT_DAILY, belowGap: 360, serverNow: MORNING_NOW }),
    ).toEqual({
      text: "아침이 끝나기 전에 따라잡을 수 있어요",
      tone: "muted",
    });
  });

  it("지금 구간이 아닌 시간대 판은 구간이 끝나기 전 문구 대신 이 판에 들어가는 시각을 알린다", () => {
    expect(
      rankCardSubLine({ board: FIXTURE_SLOT_DAILY, belowGap: 360, serverNow: AFTERNOON_NOW }),
    ).toEqual(MORNING_NOTICE);
    expect(
      rankCardSubLine({
        board: { ...FIXTURE_SLOT_DAILY, period: "WEEKLY" },
        belowGap: 360,
        serverNow: AFTERNOON_NOW,
      }),
    ).toEqual(MORNING_NOTICE);
    expect(
      rankCardSubLine({
        board: { ...FIXTURE_SLOT_DAILY, slot: "AFTERNOON" },
        belowGap: 360,
        serverNow: AFTERNOON_NOW,
      }),
    ).toEqual({ text: "점심이 끝나기 전에 따라잡을 수 있어요", tone: "muted" });
  });

  it("지금 구간이 아닌 시간대 판은 바로 위가 집중 중이어도 차이가 벌어진다고 말하지 않는다", () => {
    const aboveFocusing = {
      ...FIXTURE_SLOT_DAILY,
      above: { nickname: "수능D-40", gap: 540, focusing: true },
    };

    expect(
      rankCardSubLine({ board: aboveFocusing, belowGap: 360, serverNow: AFTERNOON_NOW }),
    ).toEqual(MORNING_NOTICE);
    expect(
      rankCardSubLine({
        board: { ...aboveFocusing, slot: "AFTERNOON" },
        belowGap: 360,
        serverNow: AFTERNOON_NOW,
      }),
    ).toEqual({ text: "앞 순위와 차이가 벌어지고 있어요", tone: "alert" });
  });

  it("지금 구간이 아닌 시간대 판은 바로 아래가 집중 중이어도 따라온다고 말하지 않는다", () => {
    expect(
      rankCardSubLine({ board: FIXTURE_SLOT_DAILY, belowGap: 290, serverNow: AFTERNOON_NOW }),
    ).toEqual(MORNING_NOTICE);
    expect(
      rankCardSubLine({ board: FIXTURE_FIRST_PLACE, belowGap: 290, serverNow: AFTERNOON_NOW }),
    ).toEqual(MORNING_NOTICE);
  });

  it("지금 구간이 아닌 시간대 판은 1위여도 2위와의 차이 대신 이 판에 들어가는 시각을 알린다", () => {
    expect(
      rankCardSubLine({ board: FIXTURE_FIRST_PLACE, belowGap: 600, serverNow: AFTERNOON_NOW }),
    ).toEqual(MORNING_NOTICE);
    expect(
      rankCardSubLine({
        board: { ...FIXTURE_FIRST_PLACE, below: null },
        belowGap: null,
        serverNow: AFTERNOON_NOW,
      }),
    ).toEqual(MORNING_NOTICE);
  });

  it("1위는 2위와의 차이를 회색으로, 2위가 없으면 비운다", () => {
    expect(
      rankCardSubLine({ board: FIXTURE_FIRST_PLACE, belowGap: 600, serverNow: MORNING_NOW }),
    ).toEqual({
      text: "2위와 10분 차이예요",
      tone: "muted",
    });
    expect(
      rankCardSubLine({
        board: { ...FIXTURE_FIRST_PLACE, below: null },
        belowGap: null,
        serverNow: MORNING_NOW,
      }),
    ).toBeNull();
  });

  it("일수 판 1위가 2위와 같으면 비운다", () => {
    expect(
      rankCardSubLine({
        board: {
          ...FIXTURE_TOTAL_DAYS,
          me: { rank: 1, value: 412, focusing: false, topPercent: 1 },
          above: null,
          below: { nickname: "합격기원", gap: 0, focusing: false },
        },
        belowGap: 0,
        serverNow: AFTERNOON_NOW,
      }),
    ).toBeNull();
  });

  it("순공 판 1위가 2위와 같고 아무도 집중 중이 아니면 비운다", () => {
    expect(
      rankCardSubLine({
        board: {
          ...FIXTURE_FIRST_PLACE,
          type: "FOCUS_TIME",
          period: "WEEKLY",
          slot: null,
          below: { nickname: "합격까지달린다", gap: 0, focusing: false },
        },
        belowGap: 0,
        serverNow: AFTERNOON_NOW,
      }),
    ).toBeNull();
  });

  it("일수 판 1위도 2위와 차이가 있으면 회색으로 보인다", () => {
    expect(
      rankCardSubLine({
        board: {
          ...FIXTURE_TOTAL_DAYS,
          me: { rank: 1, value: 412, focusing: false, topPercent: 1 },
          above: null,
          below: { nickname: "합격기원", gap: 3, focusing: false },
        },
        belowGap: 3,
        serverNow: AFTERNOON_NOW,
      }),
    ).toEqual({ text: "2위와 3일 차이예요", tone: "muted" });
  });

  it("집중률 판은 1위가 아니면 이 문구를 쓰지 않는다", () => {
    expect(
      rankCardSubLine({ board: FIXTURE_RATE_WEEKLY, belowGap: 0.2, serverNow: AFTERNOON_NOW }),
    ).toBeNull();
  });

  it("시간 판이 아니면 아래가 집중 중이어도 따라오는 문구를 쓰지 않는다", () => {
    expect(
      rankCardSubLine({
        board: {
          ...FIXTURE_FIRST_PLACE,
          type: "FOCUS_RATE",
          period: "WEEKLY",
          slot: null,
          below: { nickname: "합격까지달린다", gap: 0.2, focusing: true },
        },
        belowGap: 0.2,
        serverNow: AFTERNOON_NOW,
      }),
    ).toEqual({ text: "2위와 0.2% 차이예요", tone: "muted" });
  });
});

describe("비교 기준 추적", () => {
  const input = (
    board = FIXTURE_FOCUS_WEEKLY,
    extra: Partial<{ key: string; visible: boolean; updatedAt: number }> = {},
  ) => ({
    key: "FOCUS_TIME:WEEKLY:-",
    visible: true,
    board,
    updatedAt: 1000,
    ...extra,
  });

  it("첫 응답은 기준으로만 쓴다", () => {
    const start = startLiveTrack({ ...input(), board: undefined });

    const track = advanceLiveTrack(start, input());

    expect(track.baseline).toBe(FIXTURE_FOCUS_WEEKLY);
    expect(track.drop).toBeNull();
  });

  it("내려가면 ▼N을 남긴다", () => {
    let track = advanceLiveTrack(startLiveTrack({ ...input(), board: undefined }), input());

    track = advanceLiveTrack(track, input(FIXTURE_OVERTAKEN, { updatedAt: 2000 }));

    expect(track.drop).toEqual({ count: 3, at: 2000 });
  });

  it("같은 응답이면 그대로 돌려준다", () => {
    const track = advanceLiveTrack(startLiveTrack({ ...input(), board: undefined }), input());

    expect(advanceLiveTrack(track, input())).toBe(track);
  });

  it("key가 바뀌면 직전 응답과 비교하지 않는다", () => {
    const track = advanceLiveTrack(startLiveTrack({ ...input(), board: undefined }), input());

    const next = advanceLiveTrack(track, input(FIXTURE_OVERTAKEN, { key: "FOCUS_TIME:DAILY:-" }));

    expect(next.drop).toBeNull();
    expect(next.baseline).toBeNull();
  });

  it("기간이 새로 시작되면 내려가도 직전 기간과 비교하지 않는다", () => {
    const track = advanceLiveTrack(startLiveTrack({ ...input(), board: undefined }), input());
    const nextWeek = { ...FIXTURE_OVERTAKEN, periodStart: "2026-10-12" };

    const next = advanceLiveTrack(track, input(nextWeek, { updatedAt: 2000 }));

    expect(next.drop).toBeNull();
    expect(next.baseline).toBe(nextWeek);
  });

  it("다시 보이면 첫 새 응답은 기준으로만 쓴다", () => {
    let track = advanceLiveTrack(startLiveTrack({ ...input(), board: undefined }), input());
    track = advanceLiveTrack(track, input(FIXTURE_FOCUS_WEEKLY, { visible: false }));
    track = advanceLiveTrack(track, input(FIXTURE_FOCUS_WEEKLY, { visible: true }));

    track = advanceLiveTrack(track, input(FIXTURE_OVERTAKEN, { updatedAt: 3000 }));

    expect(track.drop).toBeNull();
    expect(track.baseline).toBe(FIXTURE_OVERTAKEN);
  });
});

describe("보간 상한", () => {
  const weekly = {
    type: "FOCUS_TIME",
    slot: null,
    asOf: "2026-10-10T05:12:30Z",
    closesAt: "2026-10-11T15:00:00Z",
  } as const;

  /** KST 시각 문자열을 UTC ISO로 바꾼다. */
  function kstIso(local: string): string {
    return new Date(`${local}+09:00`).toISOString();
  }

  it("마감까지 남은 초를 넘지 않는다", () => {
    expect(liveCapSec(weekly)).toBe(121650);
  });

  it("이미 마감을 지난 응답이면 0이다", () => {
    expect(liveCapSec({ ...weekly, asOf: "2026-10-11T15:00:05Z" })).toBe(0);
  });

  it("마감이 없고 시간대 판이 아니면 상한이 없다", () => {
    expect(liveCapSec({ type: "TOTAL_TIME", slot: null, asOf: weekly.asOf, closesAt: null })).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("시간대 판은 구간이 끝나는 시각까지만 올린다", () => {
    const morning = {
      type: "TIME_SLOT",
      slot: "MORNING",
      asOf: kstIso("2026-10-10T11:59:00"),
      closesAt: kstIso("2026-10-11T00:00:00"),
    } as const;

    expect(liveCapSec(morning)).toBe(60);
  });

  it("계산 시각이 구간 밖이면 올리지 않는다", () => {
    expect(
      liveCapSec({
        type: "TIME_SLOT",
        slot: "MORNING",
        asOf: kstIso("2026-10-10T13:00:00"),
        closesAt: kstIso("2026-10-11T00:00:00"),
      }),
    ).toBe(0);
  });

  it("새벽는 0시에 시작해 6시에 끝난다", () => {
    const night = {
      type: "TIME_SLOT",
      slot: "NIGHT",
      closesAt: kstIso("2026-10-11T00:00:00"),
    } as const;

    expect(liveCapSec({ ...night, asOf: kstIso("2026-10-10T05:59:00") })).toBe(60);
    expect(liveCapSec({ ...night, asOf: kstIso("2026-10-10T06:00:00") })).toBe(0);
    expect(liveCapSec({ ...night, asOf: kstIso("2026-10-10T23:00:00") })).toBe(0);
  });

  it("저녁은 24시에 끝난다", () => {
    expect(
      liveCapSec({
        type: "TIME_SLOT",
        slot: "EVENING",
        asOf: kstIso("2026-10-10T23:30:00"),
        closesAt: kstIso("2026-10-11T00:00:00"),
      }),
    ).toBe(1800);
  });

  it("주간 시간대 판도 오늘 구간이 끝나면 멈춘다", () => {
    expect(
      liveCapSec({
        type: "TIME_SLOT",
        slot: "EVENING",
        asOf: kstIso("2026-10-10T21:30:00"),
        closesAt: kstIso("2026-10-12T00:00:00"),
      }),
    ).toBe(9000);
  });
});
