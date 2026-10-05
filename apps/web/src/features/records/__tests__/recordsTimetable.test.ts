import { describe, expect, it } from "vitest";

import {
  kstDayStartMs,
  miniTimelinePieces,
  subjectColorVar,
  subjectRefMap,
} from "../recordsTimetable";

const DAY = "2026-09-21";
const dayStart = kstDayStartMs(DAY);
const iso = (minutes: number) => new Date(dayStart + minutes * 60_000).toISOString();

describe("subjectRefMap — 과목 id로 이름·색을 찾는다", () => {
  it("지운 과목도 이름·색을 찾을 수 있고, 없으면 빈 맵이다", () => {
    const map = subjectRefMap([
      { id: 3, name: "영어", colorIndex: 2, deleted: false },
      { id: 5, name: "수학", colorIndex: 5, deleted: true },
    ]);
    expect(map.get(5)?.deleted).toBe(true);
    expect(subjectRefMap(undefined).size).toBe(0);
  });

  it("이름이 같은 과목은 id가 달라도 살아있는 과목 하나로 모은다", () => {
    const map = subjectRefMap([
      { id: 3, name: "소마", colorIndex: 2, deleted: true },
      { id: 5, name: "소마", colorIndex: 7, deleted: false },
    ]);

    expect(map.get(3)).toEqual({ id: 5, name: "소마", colorIndex: 7, deleted: false });
    expect(map.get(5)).toEqual({ id: 5, name: "소마", colorIndex: 7, deleted: false });
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
});
