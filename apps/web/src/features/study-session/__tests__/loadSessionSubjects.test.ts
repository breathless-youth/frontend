import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  StudySessionListResponse,
  StudySessionSummary,
  SubjectResponse,
} from "@focusmakers/types";

import { queryClient } from "@/lib/queryClient";
import { listStudySessionStats } from "@/lib/statsApi";
import { listSubjects } from "@/lib/subjectApi";

import { loadSessionSubjects } from "../loadSessionSubjects";

const reportHandled = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sentry", () => ({ reportHandled }));
vi.mock("@/lib/subjectApi", () => ({ listSubjects: vi.fn() }));
vi.mock("@/lib/statsApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listStudySessionStats: vi.fn(),
}));

const DAY = "2026-10-02";
const NEXT = "2026-10-03";
/** KST 시각 → ISO. `day`는 날짜 키, 시·분은 KST. */
const kst = (day: string, hour: number, minute = 0) =>
  new Date(
    `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`,
  ).toISOString();

/** 서버 누적은 일부러 큰 값을 둬서, 화면에 나가는 값이 이것이 아님을 확인한다. */
const MATH: SubjectResponse = {
  id: 3,
  name: "수학",
  colorIndex: 0,
  studySec: 99_999,
  focusSec: 99_999,
  tasks: [],
};
const ENGLISH: SubjectResponse = { ...MATH, id: 4, name: "영어", colorIndex: 1 };

function session(
  subjectId: number,
  startedAt: string,
  endedAt: string,
  focusSec: number,
): StudySessionSummary {
  return {
    id: 1,
    statDate: startedAt.slice(0, 10),
    startedAt,
    endedAt,
    studySec: focusSec,
    focusSec,
    focusRate: 100,
    eventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
    events: [],
    subjectSegments: [{ subjectId, startedAt, endedAt, studySec: focusSec, focusSec }],
    completedTasks: [],
  };
}

function stats(
  sessions: StudySessionSummary[],
  subjects: StudySessionListResponse["subjects"] = [
    { id: 3, name: "수학", colorIndex: 0, deleted: false },
  ],
): StudySessionListResponse {
  return {
    sessions,
    sessionCount: sessions.length,
    totalStudySec: 0,
    totalFocusSec: 0,
    longestFocusSec: 0,
    focusRate: 0,
    totalEventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
    studiedDatesInMonth: [],
    subjects,
  };
}

describe("loadSessionSubjects: 세션 화면 과목 순공은 플래너 하루 기준 오늘 값", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.mocked(listSubjects).mockReset().mockResolvedValue([MATH, ENGLISH]);
    vi.mocked(listStudySessionStats).mockReset();
    reportHandled.mockReset();
  });

  it("05시 이후에는 오늘 하루만 받아 과목 순공을 그날 저장 기록으로 바꾼다", async () => {
    vi.mocked(listStudySessionStats).mockResolvedValue(
      stats([session(3, kst(DAY, 9), kst(DAY, 10), 3000)]),
    );

    const result = await loadSessionSubjects(1, new Date(kst(DAY, 9, 30)));

    expect(listStudySessionStats).toHaveBeenCalledTimes(1);
    expect(listStudySessionStats).toHaveBeenCalledWith(DAY);
    expect(result.map((subject) => [subject.id, subject.focusSec])).toEqual([
      [3, 3000],
      [4, 0],
    ]);
    // 총 공부는 화면에 쓰이지 않아 손대지 않는다.
    expect(result[0]?.studySec).toBe(99_999);
  });

  it("새벽 0~5시는 전날 하루라 전날과 오늘을 받아 밤새 공부한 시간을 잇는다", async () => {
    vi.mocked(listStudySessionStats).mockImplementation(async (date) =>
      date === DAY
        ? stats([session(3, kst(DAY, 23), kst(NEXT, 0), 1800)])
        : stats([session(3, kst(NEXT, 0), kst(NEXT, 0, 20), 1200)]),
    );

    const result = await loadSessionSubjects(1, new Date(kst(NEXT, 2)));

    expect(
      vi
        .mocked(listStudySessionStats)
        .mock.calls.map(([date]) => date)
        .sort(),
    ).toEqual([DAY, NEXT]);
    expect(result[0]?.focusSec).toBe(3000);
  });

  it("일간 조회가 실패하면 목록은 그대로 두고 오늘 값은 0이며, 다음 세션에 복구되므로 보고하지 않는다", async () => {
    vi.mocked(listStudySessionStats).mockRejectedValue(new Error("down"));

    const result = await loadSessionSubjects(1, new Date(kst(DAY, 9, 30)));

    expect(result.map((subject) => [subject.name, subject.focusSec])).toEqual([
      ["수학", 0],
      ["영어", 0],
    ]);
    expect(reportHandled).not.toHaveBeenCalled();
  });

  it.each([
    ["세션 목록이 아닌 응답(프록시 오류 페이지 등)", { version: 1 }],
    ["세션 항목이 손상된 응답", { ...stats([]), sessions: [null] }],
  ])("%s도 실패로 보고 목록은 살리며, 응답 형식 어긋남이라 보고한다", async (_label, body) => {
    vi.mocked(listStudySessionStats).mockResolvedValue(body as unknown as StudySessionListResponse);

    const result = await loadSessionSubjects(1, new Date(kst(DAY, 9, 30)));

    expect(result.map((subject) => subject.focusSec)).toEqual([0, 0]);
    expect(reportHandled).toHaveBeenCalledOnce();
    expect(reportHandled).toHaveBeenCalledWith(expect.any(Error), "session-subject-today");
  });

  it("지운 동명 과목의 기록은 플래너처럼 살아 있는 과목에 합쳐진다", async () => {
    vi.mocked(listStudySessionStats).mockResolvedValue(
      stats(
        [
          session(9, kst(DAY, 9), kst(DAY, 9, 10), 600),
          session(3, kst(DAY, 10), kst(DAY, 10, 5), 300),
        ],
        [
          { id: 3, name: "수학", colorIndex: 0, deleted: false },
          { id: 9, name: "수학", colorIndex: 5, deleted: true },
        ],
      ),
    );

    const result = await loadSessionSubjects(1, new Date(kst(DAY, 12)));

    expect(result[0]?.focusSec).toBe(900);
  });
});
