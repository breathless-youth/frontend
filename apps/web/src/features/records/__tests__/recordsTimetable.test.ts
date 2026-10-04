import { describe, expect, it } from "vitest";

import {
  SLOTS_PER_DAY,
  condenseTimetable,
  miniTimelinePieces,
  sessionRestSec,
  totalRestSec,
  subjectColorVar,
  completedTasksOf,
  dayTimetable,
  kstDayStartMs,
  subjectRefMap,
  subjectTotalsOf,
} from "../recordsTimetable";

const DAY = "2026-09-21";
const dayStart = kstDayStartMs(DAY);
const iso = (minutes: number) => new Date(dayStart + minutes * 60_000).toISOString();

const session = {
  startedAt: iso(9 * 60 + 12), // 09:12 KST
  endedAt: iso(10 * 60 + 36), // 10:36
  events: [{ status: "PHONE" as const, startedAt: iso(9 * 60 + 40), endedAt: iso(9 * 60 + 50) }],
  subjectSegments: [
    {
      subjectId: 3,
      startedAt: iso(9 * 60 + 12),
      endedAt: iso(10 * 60),
      studySec: 2880,
      focusSec: 2280,
    },
    {
      subjectId: 5,
      startedAt: iso(10 * 60),
      endedAt: iso(10 * 60 + 20),
      studySec: 1200,
      focusSec: 1200,
    },
  ],
  completedTasks: [{ id: 12, name: "문제집 1장 풀기", subjectId: 3, deleted: false }],
};

describe("recordsTimetable — 일간 응답을 2분 칸으로 바꾼다", () => {
  it("KST 자정 기준 720칸이고 세션 밖은 비어 있다", () => {
    const slots = dayTimetable([session], DAY);
    expect(slots).toHaveLength(SLOTS_PER_DAY);
    expect(slots[0]).toEqual({ kind: "empty" });
    expect(slots[SLOTS_PER_DAY - 1]).toEqual({ kind: "empty" });
  });

  it("휴식 > 과목 > 집중 순으로 칸을 덮는다", () => {
    const slots = dayTimetable([session], DAY);
    const slotOf = (minutes: number) => slots[Math.floor(minutes / 2)];
    expect(slotOf(9 * 60 + 12)).toEqual({ kind: "subject", subjectId: 3 }); // 09:12 영어
    expect(slotOf(9 * 60 + 44)).toEqual({ kind: "rest", status: "PHONE" }); // PHONE이 과목을 덮는다
    expect(slotOf(10 * 60 + 10)).toEqual({ kind: "subject", subjectId: 5 });
    expect(slotOf(10 * 60 + 30)).toEqual({ kind: "focus" }); // 과목 미선택
    expect(slotOf(10 * 60 + 36)).toEqual({ kind: "empty" }); // 세션 끝(반개구간)
  });

  it("과목별 합은 서버가 준 구간 값을 더하고 첫 등장 순을 지킨다", () => {
    expect(subjectTotalsOf([session, session], subjectRefMap(undefined))).toEqual([
      { subjectId: 3, studySec: 5760, focusSec: 4560 },
      { subjectId: 5, studySec: 2400, focusSec: 2400 },
    ]);
  });

  it("완료 할 일은 세션 순서대로 중복 없이 모은다", () => {
    expect(completedTasksOf([session, session])).toEqual(session.completedTasks);
    expect(completedTasksOf([{}])).toEqual([]);
  });

  it("subjectRefMap — 지운 과목도 이름·색을 찾을 수 있고, 없으면 빈 맵이다", () => {
    const map = subjectRefMap([
      { id: 3, name: "영어", colorIndex: 2, deleted: false },
      { id: 5, name: "수학", colorIndex: 5, deleted: true },
    ]);
    expect(map.get(5)?.deleted).toBe(true);
    expect(subjectRefMap(undefined).size).toBe(0);
  });

  it("이름이 같은 과목은 id가 달라도 살아있는 과목 한 줄·한 색으로 합친다", () => {
    const map = subjectRefMap([
      { id: 3, name: "소마", colorIndex: 2, deleted: true },
      { id: 5, name: "소마", colorIndex: 7, deleted: false },
    ]);

    expect(map.get(3)).toEqual({ id: 5, name: "소마", colorIndex: 7, deleted: false });
    expect(subjectTotalsOf([session], map)).toEqual([
      { subjectId: 5, studySec: 4080, focusSec: 3480 },
    ]);
  });
});

describe("subjectColorVar", () => {
  it("colorIndex를 20색 팔레트 변수로 순환 매핑한다", () => {
    expect(subjectColorVar(0)).toBe("var(--subject-0)");
    expect(subjectColorVar(19)).toBe("var(--subject-19)");
    expect(subjectColorVar(20)).toBe("var(--subject-0)");
    expect(subjectColorVar(-1)).toBe("var(--subject-19)");
  });
});

describe("condenseTimetable", () => {
  it("10분 묶음에서 휴식 > 과목 > 집중 > 빈 순으로 대표를 남긴다", () => {
    const empty = { kind: "empty" } as const;
    const focus = { kind: "focus" } as const;
    const subj = { kind: "subject", subjectId: 7 } as const;
    const rest = { kind: "rest", status: "PAUSE" } as const;
    // 한 묶음(5칸): 빈,집중,과목,빈,집중 → 과목이 대표
    const g1 = condenseTimetable([empty, focus, subj, empty, focus]);
    expect(g1).toHaveLength(1);
    expect(g1[0]).toEqual(subj);
    // 휴식이 있으면 휴식이 이긴다
    const g2 = condenseTimetable([subj, rest, focus, empty, empty]);
    expect(g2[0]).toEqual(rest);
    // 720칸 → 144칸
    const full = Array.from({ length: 720 }, () => empty);
    expect(condenseTimetable(full)).toHaveLength(144);
  });
});

describe("sessionRestSec — 휴식은 자동 멈춤과 일시정지를 합친다", () => {
  it("세션 시각 범위에서 순공을 뺀다(총 공부에서 빼면 일시정지가 빠진다)", () => {
    // 09:12~10:36 = 84분, 순공 60분 → 휴식 24분.
    expect(
      sessionRestSec({ startedAt: iso(9 * 60 + 12), endedAt: iso(10 * 60 + 36), focusSec: 3600 }),
    ).toBe(24 * 60);
    expect(
      sessionRestSec({ startedAt: iso(9 * 60), endedAt: iso(9 * 60 + 1), focusSec: 600 }),
    ).toBe(0);
  });

  it("하루 휴식은 세션별 휴식의 합이다", () => {
    expect(
      totalRestSec([
        { startedAt: iso(9 * 60), endedAt: iso(10 * 60), focusSec: 50 * 60 },
        { startedAt: iso(14 * 60), endedAt: iso(15 * 60), focusSec: 40 * 60 },
      ]),
    ).toBe(30 * 60);
  });
});

describe("miniTimelinePieces — 세션 시각 범위를 순공·자동 멈춤·일시정지 조각으로 자른다", () => {
  it("이벤트 사이를 순공으로 채우고 일시정지는 따로 구분한다", () => {
    // 09:00~10:40(100분): 순공 30 → 자동 멈춤 10 → 순공 20 → 일시정지 10 → 순공 30.
    const pieces = miniTimelinePieces({
      startedAt: iso(9 * 60),
      endedAt: iso(10 * 60 + 40),
      events: [
        { status: "PAUSE", startedAt: iso(10 * 60), endedAt: iso(10 * 60 + 10) },
        { status: "PHONE", startedAt: iso(9 * 60 + 30), endedAt: iso(9 * 60 + 40) },
      ],
    });

    expect(pieces.map((piece) => piece.kind)).toEqual([
      "focus",
      "distract",
      "focus",
      "pause",
      "focus",
    ]);
    expect(pieces.map((piece) => Math.round(piece.ratio * 100))).toEqual([30, 10, 20, 10, 30]);
  });

  it("이벤트가 없으면 순공 한 조각, 길이가 0이면 빈 배열이다", () => {
    expect(miniTimelinePieces({ startedAt: iso(9 * 60), endedAt: iso(10 * 60) })).toEqual([
      { kind: "focus", ratio: 1 },
    ]);
    expect(miniTimelinePieces({ startedAt: iso(9 * 60), endedAt: iso(9 * 60) })).toEqual([]);
  });
});

describe("kstDayStartMs — KST 자정 경계", () => {
  it("KST 날짜의 자정을 절대 UTC 시각으로 잡는다", () => {
    // KST는 UTC+9라 2026-09-21 00:00(KST) = 2026-09-20T15:00:00Z. 절대 시각으로 못 박아
    // kstDayStartMs를 그 자신으로 되짚는 순환 검증을 피한다.
    expect(kstDayStartMs("2026-09-21")).toBe(Date.parse("2026-09-20T15:00:00Z"));
  });

  it("자정을 건너뛰는 세션은 당일 첫 칸에만 들어가고 전날에는 잘린다", () => {
    // KST 2026-09-21 00:00~00:04 = UTC 2026-09-20T15:00~15:04.
    const crossMidnight = {
      startedAt: "2026-09-20T15:00:00Z",
      endedAt: "2026-09-20T15:04:00Z",
    };
    const today = dayTimetable([crossMidnight], "2026-09-21");
    expect(today[0]).toEqual({ kind: "focus" }); // 첫 칸(00:00~00:02)이 세션 안
    const yesterday = dayTimetable([crossMidnight], "2026-09-20");
    expect(yesterday[SLOTS_PER_DAY - 1]).toEqual({ kind: "empty" }); // 전날 마지막 칸에서 잘린다
  });
});
