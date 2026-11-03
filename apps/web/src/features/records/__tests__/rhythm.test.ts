import { describe, expect, it } from "vitest";

import { RHYTHM_MIN_STUDY_DAYS, buildStudyRhythm, peakRangeParts } from "../rhythm";

const zeroGrid = () => Array.from({ length: 7 }, () => Array<number>(24).fill(0));

/** 시계 시각(0~23) 칸에 순공 초를 넣은 격자. */
function gridWith(cells: Array<[weekday: number, hour: number, sec: number]>) {
  const grid = zeroGrid();
  for (const [weekday, hour, sec] of cells) {
    grid[weekday]![hour] = sec;
  }
  return grid;
}

describe("buildStudyRhythm", () => {
  it("누적 공부일이 14일 전이면 null — 카드는 샘플을 그린다", () => {
    expect(
      buildStudyRhythm({
        studyDays: RHYTHM_MIN_STUDY_DAYS - 1,
        focusSecByWeekdayHour: gridWith([[1, 20, 3600]]),
      }),
    ).toBeNull();
  });

  it("시계 시각을 5시 시작 칸으로 돌리고 가장 진한 칸을 5단계의 5로 둔다", () => {
    const rhythm = buildStudyRhythm({
      studyDays: 14,
      // 화요일 20시 1시간, 수요일 2시(새벽) 12분, 일요일 4시 1초 — 기록이 있으면 최소 1단계.
      focusSecByWeekdayHour: gridWith([
        [1, 20, 3600],
        [2, 2, 720],
        [6, 4, 1],
      ]),
    });

    expect(rhythm).not.toBeNull();
    // 20시 → 15번째 칸(5시가 0번), 2시 → 21번째 칸, 4시 → 마지막 칸.
    expect(rhythm!.levels[1]![15]).toBe(5);
    expect(rhythm!.levels[2]![21]).toBe(1);
    expect(rhythm!.levels[6]![23]).toBe(1);
    expect(rhythm!.levels.flat().filter((level) => level > 0)).toHaveLength(3);
    expect(rhythm!.studyDays).toBe(14);
  });

  it("요일을 합쳐 순공이 가장 큰 연속 2시간을 고른다 — 같으면 이른 쪽", () => {
    const rhythm = buildStudyRhythm({
      studyDays: 20,
      // 월 21시 50분 + 수 22시 50분 = 21~23시 100분 > 금 15~17시 90분.
      focusSecByWeekdayHour: gridWith([
        [0, 21, 3000],
        [2, 22, 3000],
        [4, 15, 2700],
        [4, 16, 2700],
      ]),
    });

    expect(rhythm!.peakStartHour).toBe(21);
    expect(rhythm!.peakColumn).toBe(16);
  });

  it("14일은 넘었는데 격자가 비어 있으면 null — 없는 시간대를 문장으로 말하지 않는다", () => {
    expect(buildStudyRhythm({ studyDays: 14, focusSecByWeekdayHour: zeroGrid() })).toBeNull();
  });
});

describe("peakRangeParts", () => {
  it("구간 가운데 시각으로 하루 구간 이름을 정한다", () => {
    expect(peakRangeParts(20)).toMatchObject({ period: "evening", from12: 8, to12: 10 });
    expect(peakRangeParts(15)).toMatchObject({ period: "afternoon", from12: 3, to12: 5 });
    expect(peakRangeParts(6)).toMatchObject({ period: "morning", from12: 6, to12: 8 });
    expect(peakRangeParts(9)).toMatchObject({ period: "forenoon" });
    expect(peakRangeParts(22)).toMatchObject({ period: "night", from12: 10, to12: 12 });
    expect(peakRangeParts(2)).toMatchObject({ period: "dawn" });
  });

  it("정오를 넘는 11~13시만 오전·오후를 나눠 적는다 — 자정을 넘는 23~1시는 `밤 11~1시`로 둔다", () => {
    expect(peakRangeParts(11)).toMatchObject({ crossesNoon: true, from12: 11, to12: 1 });
    expect(peakRangeParts(23)).toMatchObject({
      period: "night",
      crossesNoon: false,
      from12: 11,
      to12: 1,
    });
    expect(peakRangeParts(20)).toMatchObject({ crossesNoon: false });
  });
});
