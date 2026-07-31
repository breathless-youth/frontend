import { describe, expect, it } from "vitest";

import {
  addDaysToDateKey,
  buildMonthGrid,
  eventChipItems,
  formatDuration,
  formatFocusRate,
  formatKstClock,
  formatSessionCount,
  formatSessionMeta,
  isFutureDateKey,
  isDateKeyInMonth,
  kstDateKey,
  monthLabel,
  monthOfDateKey,
  shiftMonth,
  statsQueryDateKey,
  summaryTitle,
  weekDateKeys,
} from "../recordsFormat";

describe("formatDuration — voice-tone §2 시간 길이 표기", () => {
  it("1시간 이상이면 'N시간 M분'", () => {
    expect(formatDuration(2 * 3600 + 7 * 60)).toBe("2시간 7분");
  });

  it("분이 0이면 '시간'만 남긴다", () => {
    expect(formatDuration(3 * 3600)).toBe("3시간");
  });

  it("1시간 미만이면 'M분'", () => {
    expect(formatDuration(48 * 60)).toBe("48분");
  });

  it("1분 미만이면 'S초'", () => {
    expect(formatDuration(42)).toBe("42초");
  });

  it("0초는 빈 상태 표기 '0분'으로 보여준다", () => {
    expect(formatDuration(0)).toBe("0분");
  });

  it("진행 중 타이머의 HH:MM:SS 규칙을 쓰지 않는다", () => {
    expect(formatDuration(3661)).not.toContain(":");
  });
});

describe("KST 변환 — 서버는 UTC ISO-8601로 내려준다", () => {
  it("UTC를 KST HH:MM(24시간제)로 바꾼다", () => {
    expect(formatKstClock("2026-07-25T23:55:00.000Z")).toBe("08:55");
  });

  it("자정을 넘는 경우도 KST 벽시계로 읽는다", () => {
    expect(formatKstClock("2026-07-26T16:20:00.000Z")).toBe("01:20");
  });

  it("기기 시간대와 무관하게 KST 날짜 키를 만든다", () => {
    // UTC 2026-07-25T15:30Z = KST 2026-07-26 00:30 → 통계 귀속 날짜는 26일이다.
    expect(kstDateKey(new Date("2026-07-25T15:30:00.000Z"))).toBe("2026-07-26");
  });
});

describe("formatSessionMeta", () => {
  it("'HH:MM – HH:MM · 총 {시간 길이}' 형식이고 구분자가 엔대시다", () => {
    const meta = formatSessionMeta(
      "2026-07-25T23:55:00.000Z",
      "2026-07-26T02:02:00.000Z",
      2 * 3600 + 7 * 60,
    );

    expect(meta).toBe("08:55 – 11:02 · 총 2시간 7분");
    expect(meta).toContain("–");
  });
});

describe("formatFocusRate / formatSessionCount", () => {
  it("소수 1자리 집중률을 정수로 반올림한다", () => {
    expect(formatFocusRate(77.2)).toBe("77%");
    expect(formatFocusRate(68.6)).toBe("69%");
  });

  it("공부 횟수는 'N회'", () => {
    expect(formatSessionCount(3)).toBe("3회");
  });
});

describe("eventChipItems — S5 뱃지는 축약형 · 횟수만", () => {
  it("0인 상태는 칩을 만들지 않는다", () => {
    expect(eventChipItems({ AWAY: 2, PHONE: 1, DEVICE: 0, PAUSE: 0 })).toEqual([
      { status: "AWAY", label: "자리 이탈 2회" },
      { status: "PHONE", label: "휴대폰 1회" },
    ]);
  });

  it("전부 0이면 빈 배열", () => {
    expect(eventChipItems({ AWAY: 0, PHONE: 0, DEVICE: 0, PAUSE: 0 })).toEqual([]);
  });

  it("S4의 'N회 · 시간' 표기를 쓰지 않는다(횟수만)", () => {
    const labels = eventChipItems({ AWAY: 1, PHONE: 1, DEVICE: 1, PAUSE: 1 }).map(
      (chip) => chip.label,
    );

    expect(labels).toEqual(["자리 이탈 1회", "휴대폰 1회", "기기 조작 1회", "일시정지 1회"]);
    labels.forEach((label) => {
      expect(label).not.toContain("·");
    });
  });

  it("삭제된 '화면 꺼짐' 라벨을 쓰지 않는다(2026-07-26 일시정지로 통합)", () => {
    const labels = eventChipItems({ AWAY: 1, PHONE: 1, DEVICE: 1, PAUSE: 1 }).map(
      (chip) => chip.label,
    );

    expect(labels.join(" ")).not.toContain("화면 꺼짐");
  });

  it("S4의 전체 라벨('휴대폰 사용')이 아니라 축약 라벨을 쓴다", () => {
    expect(eventChipItems({ AWAY: 0, PHONE: 3, DEVICE: 0, PAUSE: 0 })[0].label).toBe("휴대폰 3회");
  });
});

describe("달력 유틸", () => {
  it("달 라벨과 요약 타이틀 형식", () => {
    expect(monthLabel({ year: 2026, month: 7 })).toBe("2026년 7월");
    expect(summaryTitle("2026-07-24")).toBe("7월 24일 학습 요약");
  });

  it("월 이동은 연도 경계를 넘는다", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("일요일 시작 7열 그리드를 만들고 앞뒤를 빈칸으로 채운다", () => {
    // 2026-07-01은 수요일 → 앞에 빈칸 3개.
    const grid = buildMonthGrid({ year: 2026, month: 7 });

    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0].slice(0, 3)).toEqual([null, null, null]);
    expect(grid[0][3]).toBe("2026-07-01");
    expect(grid.flat().filter((cell) => cell !== null)).toHaveLength(31);
  });

  it("주 키는 일~토 7일이고 월 경계를 넘어 이어진다", () => {
    // 2026-07-27(월)이 속한 주는 7/26(일)~8/1(토)이다.
    expect(weekDateKeys("2026-07-27")).toEqual([
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
    ]);
  });

  it("날짜 키 덧셈이 월 경계를 넘는다", () => {
    expect(addDaysToDateKey("2026-08-01", -1)).toBe("2026-07-31");
    expect(monthOfDateKey("2026-07-31")).toEqual({ year: 2026, month: 7 });
  });

  it("미래 날짜를 판별한다(오늘은 미래가 아니다)", () => {
    expect(isFutureDateKey("2026-07-27", "2026-07-26")).toBe(true);
    expect(isFutureDateKey("2026-07-26", "2026-07-26")).toBe(false);
    expect(isFutureDateKey("2026-07-25", "2026-07-26")).toBe(false);
  });
});

describe("isDateKeyInMonth", () => {
  it("연·월이 모두 같을 때만 true다", () => {
    expect(isDateKeyInMonth("2026-07-26", { year: 2026, month: 7 })).toBe(true);
    expect(isDateKeyInMonth("2026-07-26", { year: 2026, month: 8 })).toBe(false);
    // 월이 같아도 연도가 다르면 false — 연도 비교 누락 회귀 방지.
    expect(isDateKeyInMonth("2025-07-26", { year: 2026, month: 7 })).toBe(false);
  });
});

describe("statsQueryDateKey", () => {
  it("선택일이 보이는 달에 있으면 선택일을 그대로 쓴다", () => {
    expect(statsQueryDateKey("2026-07-26", { year: 2026, month: 7 })).toBe("2026-07-26");
  });

  it("다른 달을 보는 중이면 그 달 1일을 쓴다", () => {
    expect(statsQueryDateKey("2026-07-26", { year: 2026, month: 8 })).toBe("2026-08-01");
    expect(statsQueryDateKey("2026-07-26", { year: 2025, month: 12 })).toBe("2025-12-01");
  });
});
