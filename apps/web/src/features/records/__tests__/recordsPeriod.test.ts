import { describe, expect, it } from "vitest";

import {
  averageFocusRatePercent,
  averageFocusSecPerStudiedDay,
  averageStudySecPerStudiedDay,
  bestDay,
  buildDayFocusMap,
  focusDeltaSec,
  isFutureMonth,
  isFutureWeek,
  mondayWeekDateKeys,
  monthRanges,
  studiedDayCount,
  sumFocusSec,
  relativeWeekLabel,
  weekComparison,
  weekFocusDeltaSec,
  weekRangeLabel,
  weekRanges,
  weekTrendPoints,
} from "../recordsPeriod";

const day = (date: string, focusSec: number) => ({ date, studySec: focusSec + 100, focusSec });

describe("recordsPeriod — 주간·월간 범위와 헤더 숫자", () => {
  it("주는 월요일에 시작한다 — 일요일을 고르면 그 주의 월요일까지 거슬러 간다", () => {
    expect(mondayWeekDateKeys("2026-09-27")[0]).toBe("2026-09-21"); // 일요일
    expect(mondayWeekDateKeys("2026-09-21")[0]).toBe("2026-09-21"); // 월요일
    expect(mondayWeekDateKeys("2026-09-24")).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
  });

  it("weekRanges — 그 주와 직전 주", () => {
    expect(weekRanges("2026-09-24")).toEqual({
      range: { from: "2026-09-21", to: "2026-09-27" },
      compareRange: { from: "2026-09-14", to: "2026-09-20" },
    });
  });

  it("monthRanges — 말일과 연도 넘김을 맞춘다", () => {
    expect(monthRanges({ year: 2026, month: 3 })).toEqual({
      range: { from: "2026-03-01", to: "2026-03-31" },
      compareRange: { from: "2026-02-01", to: "2026-02-28" },
    });
    expect(monthRanges({ year: 2026, month: 1 }).compareRange).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(monthRanges({ year: 2028, month: 3 }).compareRange.to).toBe("2028-02-29");
  });

  it("합계·증감·최고·공부일", () => {
    const daily = [day("2026-09-21", 3600), day("2026-09-22", 0), day("2026-09-23", 7200)];
    const compare = [day("2026-09-14", 4000), day("2026-09-15", 4000)];
    expect(sumFocusSec(daily)).toBe(10800);
    expect(focusDeltaSec(daily, compare)).toBe(2800);
    expect(bestDay(daily)).toEqual(day("2026-09-23", 7200));
    expect(bestDay([day("2026-09-22", 0)])).toBeNull();
    expect(studiedDayCount(daily)).toBe(2);
  });
});

describe("weekTrendPoints — 이번 주 미래 날짜 제외", () => {
  // 2026-09-14(월)~20(일). 실제 API처럼 7일을 focusSec 포함 0으로 채운다.
  const fullWeek = [
    day("2026-09-14", 2 * 3600), // 월
    day("2026-09-15", 3600), // 화
    day("2026-09-16", 3 * 3600), // 수 = 오늘
    day("2026-09-17", 0), // 목 (미래, 서버가 0으로 채움)
    day("2026-09-18", 0), // 금 (미래)
    day("2026-09-19", 0), // 토 (미래)
    day("2026-09-20", 0), // 일 (미래)
  ];

  it("todayKey(수) 이후 요일은 thisWeek이 null이라 선에서 빠진다", () => {
    const points = weekTrendPoints(fullWeek, [], "2026-09-16");
    // 월·화·수는 값, 목~일은 null.
    expect(points.map((p) => p.thisWeekSec)).toEqual([
      2 * 3600,
      3600,
      3 * 3600,
      null,
      null,
      null,
      null,
    ]);
  });

  it("지난주(compareDaily)도 과거 요일은 값을 채운다", () => {
    const points = weekTrendPoints(
      [],
      [day("2026-09-07", 3600), day("2026-09-13", 2 * 3600)],
      "2026-09-16",
    );
    expect(points[0]?.lastWeekSec).toBe(3600); // 월
    expect(points[6]?.lastWeekSec).toBe(2 * 3600); // 일
  });

  it("지난주(compareDaily)도 todayKey 이후 요일은 null이다 — 미래 주 대칭 처리(회귀)", () => {
    // 오늘 09-24(목). 서버가 0으로 채운 미래 요일(금·토·일)이 지난주 선에 0으로 그려지면 안 된다.
    // 2026-09-21 월 … 09-27 일. 09-23(수)은 과거, 09-26(토)은 미래.
    const points = weekTrendPoints(
      [],
      [day("2026-09-23", 3600), day("2026-09-26", 0)],
      "2026-09-24",
    );
    expect(points[2]?.lastWeekSec).toBe(3600); // 수(과거) 값
    expect(points[5]?.lastWeekSec).toBeNull(); // 토(미래) 제외
  });

  it("요일 순서를 섞어 넣어도 월=0…일=6으로 정렬한다", () => {
    const points = weekTrendPoints(
      [day("2026-09-16", 3 * 3600), day("2026-09-14", 2 * 3600)],
      [],
      "2026-09-20",
    );
    expect(points.map((p) => p.day)).toEqual(["월", "화", "수", "목", "금", "토", "일"]);
    expect(points[0]?.thisWeekSec).toBe(2 * 3600); // 월
    expect(points[2]?.thisWeekSec).toBe(3 * 3600); // 수
  });
});

describe("isFutureMonth — 그 달 1일이 오늘 달보다 미래", () => {
  it("현재 달(오늘 포함)과 과거 달은 미래가 아니다", () => {
    expect(isFutureMonth({ year: 2026, month: 9 }, "2026-09-20")).toBe(false); // 현재 달
    expect(isFutureMonth({ year: 2026, month: 9 }, "2026-09-01")).toBe(false); // 현재 달 1일
    expect(isFutureMonth({ year: 2026, month: 8 }, "2026-09-20")).toBe(false); // 과거 달
    expect(isFutureMonth({ year: 2025, month: 12 }, "2026-09-20")).toBe(false); // 과거 연도
  });

  it("다음 달·다음 연도는 미래다", () => {
    expect(isFutureMonth({ year: 2026, month: 10 }, "2026-09-20")).toBe(true);
    expect(isFutureMonth({ year: 2027, month: 1 }, "2026-12-31")).toBe(true);
  });
});

describe("isFutureWeek — 그 주 월요일이 오늘보다 미래", () => {
  it("현재 주(오늘 포함)와 지난 주는 미래가 아니다", () => {
    // 2026-09-16(수)이 오늘. 이번 주 월요일은 09-14 ≤ 오늘.
    expect(isFutureWeek("2026-09-16", "2026-09-16")).toBe(false); // 이번 주(anchor=오늘)
    expect(isFutureWeek("2026-09-20", "2026-09-16")).toBe(false); // 같은 주 일요일 앵커
    expect(isFutureWeek("2026-09-14", "2026-09-14")).toBe(false); // 오늘이 월요일
    expect(isFutureWeek("2026-09-09", "2026-09-16")).toBe(false); // 지난 주
  });

  it("다음 주(월요일이 오늘 이후)는 미래다", () => {
    // 09-23(수) 앵커의 주 월요일은 09-21 > 오늘 09-16.
    expect(isFutureWeek("2026-09-23", "2026-09-16")).toBe(true);
    expect(isFutureWeek("2026-09-21", "2026-09-16")).toBe(true); // 다음 주 월요일 앵커
  });
});

describe("weekFocusDeltaSec — 같은 경과 기간끼리 비교", () => {
  it("진행 중인 주(월요일=경과 1일)면 지난주도 월요일까지만 비교한다", () => {
    // 2026-09-21(월) 앵커·오늘. 이번 주는 월 하루, 지난주는 7일 전체가 내려와도 월요일까지만 본다.
    const daily = [day("2026-09-21", 2 * 3600)]; // 월 2시간
    const compare = [
      day("2026-09-14", 3600), // 지난주 월 1시간 (비교 대상)
      day("2026-09-15", 5 * 3600), // 지난주 화 (제외)
      day("2026-09-20", 3 * 3600), // 지난주 일 (제외)
    ];
    // 전체 vs 전체라면 2h - 9h = -7h이지만, 월요일까지만 보면 2h - 1h = +1h.
    expect(weekFocusDeltaSec(daily, compare, "2026-09-21", "2026-09-21")).toBe(3600);
  });

  it("완료된 과거 주는 전체 vs 전체로 비교한다", () => {
    // 오늘 2026-09-25. 보는 주(월 09-14~일 09-20)는 완료된 과거.
    const daily = [day("2026-09-14", 2 * 3600), day("2026-09-20", 3 * 3600)]; // 5시간
    const compare = [day("2026-09-07", 3600)]; // 1시간
    expect(weekFocusDeltaSec(daily, compare, "2026-09-14", "2026-09-25")).toBe(4 * 3600);
  });
});

describe("averageFocusSecPerStudiedDay — 공부한 날만 센 하루 평균", () => {
  it("합계를 공부한 날 수로 나눈다(쉰 날은 분모에서 뺀다)", () => {
    const daily = [day("2026-09-01", 3 * 3600), day("2026-09-02", 0), day("2026-09-03", 3600)];
    expect(averageFocusSecPerStudiedDay(daily)).toBe(2 * 3600);
  });

  it("평균은 분 단위로 반올림한다 — 화면이 분 아래를 버려도 31.7분이 31분이 되지 않게", () => {
    // 4시간 31분 40초와 4시간 31분 44초의 평균 4시간 31분 42초 → 4시간 32분.
    const daily = [day("2026-09-01", 16300), day("2026-09-02", 16304)];
    expect(averageFocusSecPerStudiedDay(daily)).toBe(4 * 3600 + 32 * 60);
    // 30초 미만은 내린다.
    expect(averageFocusSecPerStudiedDay([day("2026-09-01", 3600 + 29)])).toBe(3600);
  });

  it("공부한 날이 없으면 null이다", () => {
    expect(averageFocusSecPerStudiedDay([day("2026-09-01", 0)])).toBeNull();
    expect(averageFocusSecPerStudiedDay([])).toBeNull();
  });
});

describe("buildDayFocusMap", () => {
  it("날짜별 순공시간을 맵으로 만든다", () => {
    const map = buildDayFocusMap([
      { date: "2026-09-01", studySec: 100, focusSec: 90 },
      { date: "2026-09-02", studySec: 0, focusSec: 0 },
    ]);
    expect(map.get("2026-09-01")).toBe(90);
    expect(map.get("2026-09-02")).toBe(0);
    expect(map.has("2026-09-03")).toBe(false);
  });
});

describe("주간 평균 — 공부시간과 집중률", () => {
  const stat = (date: string, focusSec: number, studySec: number) => ({ date, studySec, focusSec });

  it("하루 평균 공부시간은 총 공부 합계를 공부한 날 수로 나눈다", () => {
    const daily = [stat("2026-09-14", 3600, 2 * 3600), stat("2026-09-15", 0, 0)];
    expect(averageStudySecPerStudiedDay(daily)).toBe(2 * 3600);
    // 순공과 같이 분 단위로 반올림한다.
    expect(averageStudySecPerStudiedDay([stat("2026-09-14", 3600, 2 * 3600 + 31)])).toBe(
      2 * 3600 + 60,
    );
    expect(averageStudySecPerStudiedDay([stat("2026-09-14", 0, 0)])).toBeNull();
  });

  it("평균 집중률은 순공 합계 ÷ 총 공부 합계다(날짜별 집중률의 평균이 아니다)", () => {
    // 하루는 1시간 중 1시간(100%), 하루는 9시간 중 3시간(33%) → 단순 평균 67%가 아니라 4 ÷ 10 = 40%.
    const daily = [stat("2026-09-14", 3600, 3600), stat("2026-09-15", 3 * 3600, 9 * 3600)];
    expect(averageFocusRatePercent(daily)).toBe(40);
    expect(averageFocusRatePercent([])).toBeNull();
  });
});

describe("weekComparison — 추이 카드 제목이 말할 비교", () => {
  it("두 주 모두 기록이 있으면 같은 경과 기간끼리의 델타다", () => {
    // 오늘 09-15(화). 이번 주 월·화 3시간, 지난주 월·화 5시간(수요일 4시간은 제외) → -2시간.
    const daily = [day("2026-09-14", 2 * 3600), day("2026-09-15", 3600)];
    const compare = [
      day("2026-09-07", 3600),
      day("2026-09-08", 4 * 3600),
      day("2026-09-09", 4 * 3600),
    ];
    expect(weekComparison(daily, compare, "2026-09-15", "2026-09-15")).toEqual({
      kind: "delta",
      inProgress: true,
      deltaSec: -2 * 3600,
    });
  });

  it("기록 유무에 따라 비교 없음·이번 주 없음·둘 다 없음으로 갈린다", () => {
    const some = [day("2026-09-14", 3600)];
    const none = [day("2026-09-07", 0)];
    expect(weekComparison(some, none, "2026-09-15", "2026-09-15")).toEqual({
      kind: "no-previous",
      inProgress: true,
      totalSec: 3600,
    });
    expect(weekComparison(none, some, "2026-09-15", "2026-09-30")).toEqual({
      kind: "no-current",
      inProgress: false,
    });
    expect(weekComparison(none, none, "2026-09-15", "2026-09-15")).toEqual({
      kind: "empty",
      inProgress: true,
    });
  });
});

describe("주 라벨", () => {
  it("weekRangeLabel — 같은 달이면 끝 날짜의 달을 생략한다", () => {
    expect(weekRangeLabel("2026-09-18")).toBe("9월 14일 ~ 20일");
    expect(weekRangeLabel("2026-10-01")).toBe("9월 28일 ~ 10월 4일");
  });

  it("relativeWeekLabel — 이번 주를 볼 때는 이번 주 · 지난주, 과거 주를 볼 때는 N주 전", () => {
    expect(relativeWeekLabel("2026-09-18", "2026-09-18")).toBe("이번 주");
    expect(relativeWeekLabel("2026-09-18", "2026-09-18", 1)).toBe("지난주");
    expect(relativeWeekLabel("2026-09-09", "2026-09-18")).toBe("1주 전");
    expect(relativeWeekLabel("2026-09-09", "2026-09-18", 1)).toBe("2주 전");
  });
});
