import type { StudySessionListResponse, StudySessionSummary } from "@focusmakers/types";

import { MIN_DISPLAYED_FOCUS_SEC, isDisplayedSession, toDisplayedStats } from "../displayedStats";

function session(overrides: Partial<StudySessionSummary> = {}): StudySessionSummary {
  return {
    id: 1,
    statDate: "2026-07-30",
    startedAt: "2026-07-30T01:00:00.000Z",
    endedAt: "2026-07-30T02:00:00.000Z",
    studySec: 3600,
    focusSec: 3000,
    focusRate: 83.3,
    eventCounts: { PHONE: 1, DEVICE: 0, AWAY: 2, PAUSE: 1 },
    ...overrides,
  };
}

function response(
  sessions: StudySessionSummary[],
  overrides: Partial<StudySessionListResponse> = {},
): StudySessionListResponse {
  const totalStudySec = sessions.reduce((sum, each) => sum + each.studySec, 0);
  const totalFocusSec = sessions.reduce((sum, each) => sum + each.focusSec, 0);
  return {
    sessions,
    sessionCount: sessions.length,
    totalStudySec,
    totalFocusSec,
    longestFocusSec: sessions.reduce((max, each) => Math.max(max, each.focusSec), 0),
    focusRate: totalStudySec === 0 ? 0 : Math.round((totalFocusSec / totalStudySec) * 1000) / 10,
    totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 },
    studiedDatesInMonth: ["2026-07-30"],
    ...overrides,
  };
}

describe("isDisplayedSession", () => {
  it("순공 1분 이상만 보여준다", () => {
    expect(isDisplayedSession(session({ focusSec: MIN_DISPLAYED_FOCUS_SEC }))).toBe(true);
    expect(isDisplayedSession(session({ focusSec: 61 }))).toBe(true);
    expect(isDisplayedSession(session({ focusSec: 59 }))).toBe(false);
    expect(isDisplayedSession(session({ focusSec: 0 }))).toBe(false);
  });

  /** 판정 기준은 순공시간이다 — 총 공부 시간이 길어도 순공이 짧으면 기록에 남지 않는다. */
  it("총 공부 시간이 길어도 순공이 1분 미만이면 제외한다", () => {
    expect(isDisplayedSession(session({ studySec: 7200, focusSec: 30 }))).toBe(false);
  });
});

describe("toDisplayedStats", () => {
  it("1분 미만 세션을 목록에서 제외한다", () => {
    const kept = session({ id: 1, focusSec: 3000 });
    const dropped = session({ id: 2, focusSec: 30, studySec: 120 });

    const result = toDisplayedStats(response([kept, dropped]));

    expect(result.sessions.map((each) => each.id)).toEqual([1]);
  });

  /**
   * 목록만 걸러내면 `공부 횟수 3회`인데 항목이 2개인 모순이 생긴다 — 합산이 목록과 같은
   * 출처에서 나와야 구조적으로 어긋나지 않는다.
   */
  it("합산을 살아남은 세션에서 다시 계산한다", () => {
    const result = toDisplayedStats(
      response([
        session({ id: 1, studySec: 3600, focusSec: 3000 }),
        session({ id: 2, studySec: 1800, focusSec: 1200 }),
        session({ id: 3, studySec: 120, focusSec: 30 }),
      ]),
    );

    expect(result.sessionCount).toBe(2);
    expect(result.totalStudySec).toBe(5400);
    expect(result.totalFocusSec).toBe(4200);
    expect(result.longestFocusSec).toBe(3000);
  });

  it("집중률도 다시 계산한다 — 제외된 세션이 분모에 남지 않는다", () => {
    const result = toDisplayedStats(
      response([
        session({ id: 1, studySec: 1000, focusSec: 500 }),
        session({ id: 2, studySec: 1000, focusSec: 30 }),
      ]),
    );

    // 살아남은 세션만 보면 500/1000 = 50%. 제외된 세션까지 세면 26.5%가 된다.
    expect(result.focusRate).toBe(50);
  });

  it("이벤트 건수도 살아남은 세션만 합산한다", () => {
    const result = toDisplayedStats(
      response([
        session({ id: 1, focusSec: 3000, eventCounts: { PHONE: 1, DEVICE: 2, AWAY: 3, PAUSE: 4 } }),
        session({ id: 2, focusSec: 30, eventCounts: { PHONE: 9, DEVICE: 9, AWAY: 9, PAUSE: 9 } }),
      ]),
    );

    expect(result.totalEventCounts).toEqual({ PHONE: 1, DEVICE: 2, AWAY: 3, PAUSE: 4 });
  });

  it("전부 1분 미만이면 빈 목록과 0 합산이 된다", () => {
    const result = toDisplayedStats(
      response([session({ id: 1, focusSec: 30 }), session({ id: 2, focusSec: 10 })]),
    );

    expect(result.sessions).toEqual([]);
    expect(result.sessionCount).toBe(0);
    expect(result.totalStudySec).toBe(0);
    expect(result.totalFocusSec).toBe(0);
    // 빈 배열에 Math.max()를 쓰면 -Infinity가 되어 화면까지 새어나간다.
    expect(result.longestFocusSec).toBe(0);
    expect(result.focusRate).toBe(0);
  });

  /**
   * 한 달 전체 값이라 하루치 응답에서 파생할 수 없다. 서버가 BE 합의 ③을 반영해야 사라지는
   * 괴리이고(1분 미만만 있는 날이 달력에 찍힘), 여기서 지어내지 않는다.
   */
  it("studiedDatesInMonth는 서버 값을 그대로 둔다", () => {
    const result = toDisplayedStats(
      response([session({ focusSec: 30 })], { studiedDatesInMonth: ["2026-07-29", "2026-07-30"] }),
    );

    expect(result.studiedDatesInMonth).toEqual(["2026-07-29", "2026-07-30"]);
  });

  /**
   * react-query 캐시 참조가 유지돼야 화면의 `useMemo`(records의 정렬)가 실제로 메모로 동작한다.
   * 서버가 합의 ③을 반영하면 **항상** 이 경로를 타므로, 그때 이 함수는 무해한 통과가 된다.
   */
  it("걸러낼 세션이 없으면 같은 객체를 그대로 돌려준다", () => {
    const original = response([session({ id: 1, focusSec: 3000 })]);

    expect(toDisplayedStats(original)).toBe(original);
  });

  it("세션이 아예 없는 응답도 그대로 통과시킨다", () => {
    const empty = response([]);

    expect(toDisplayedStats(empty)).toBe(empty);
  });
});
