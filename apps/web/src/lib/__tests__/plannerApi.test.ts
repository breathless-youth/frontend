import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPlannerTask,
  getPlannerDay,
  getPlannerSummary,
  getPlannerTaskRepeat,
  listPlannerDays,
  selectPlannerSubject,
} from "../plannerApi";

const request = vi.fn<typeof fetch>();

beforeEach(() => {
  request.mockReset();
  vi.stubGlobal("fetch", request);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("planner API", () => {
  it("반복 편집 초기값을 회차 key와 시간대로 조회하고 무기한 종료일을 보존한다", async () => {
    const rule = {
      seriesId: 4,
      startDate: "2026-11-06",
      weekdays: ["MONDAY", "FRIDAY"],
      endDate: null,
    };
    request.mockResolvedValue(Response.json(rule));
    const controller = new AbortController();

    const result = await getPlannerTaskRepeat("r:4:2026-11-06", {
      timeZone: "America/New_York",
      signal: controller.signal,
    });

    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe("/api/planner/tasks/r%3A4%3A2026-11-06/repeat?timeZone=America%2FNew_York");
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get("API-Version")).toBe("1");
    expect(init?.signal).toBe(controller.signal);
    expect(result).toEqual(rule);
  });

  it("05시 기준 날짜 조회에 기기 시간대와 API-Version 1을 보내고 적용 목표 0을 보존한다", async () => {
    request.mockResolvedValue(
      Response.json({
        date: "2026-11-06",
        timeZone: "Asia/Seoul",
        studySec: 0,
        focusSec: 0,
        goal: { goalSec: 0, individualGoalSec: 0, defaultGoalSec: 14400 },
        subjects: [],
        records: [],
      }),
    );

    const day = await getPlannerDay("2026-11-06", { timeZone: "Asia/Seoul" });

    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe("/api/planner/days/2026-11-06?timeZone=Asia%2FSeoul");
    expect(new Headers(init?.headers).get("API-Version")).toBe("1");
    expect(day.goal.goalSec).toBe(0);
    expect(day.goal.defaultGoalSec).toBe(14400);
  });

  it("할 일의 계획 날짜와 반복 조건을 새 경로로 보내고 회차 key를 보존한다", async () => {
    request.mockResolvedValue(
      Response.json(
        {
          key: "r:4:2026-11-06",
          taskId: 12,
          subjectId: 3,
          name: "수학 3단원",
          date: "2026-11-06",
          done: false,
          doneAt: null,
          seriesId: 4,
          occurrenceDate: "2026-11-06",
          dismissed: false,
        },
        { status: 201 },
      ),
    );

    const task = await createPlannerTask(
      {
        subjectId: 3,
        date: "2026-11-06",
        name: "수학 3단원",
        repeat: { weekdays: ["MONDAY", "FRIDAY"], endDate: null },
      },
      { timeZone: "Asia/Seoul" },
    );

    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe("/api/planner/tasks?timeZone=Asia%2FSeoul");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      subjectId: 3,
      date: "2026-11-06",
      name: "수학 3단원",
      repeat: { weekdays: ["MONDAY", "FRIDAY"], endDate: null },
    });
    expect(task.key).toBe("r:4:2026-11-06");
    expect(task.taskId).toBe(12);
  });

  it("그날 과목 선택은 PUT을 보내고 본문 없는 204를 해석하지 않는다", async () => {
    request.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      selectPlannerSubject("2026-11-06", 3, { timeZone: "Asia/Seoul" }),
    ).resolves.toBeUndefined();

    expect(request.mock.calls[0]?.[0]).toBe(
      "/api/planner/days/2026-11-06/subjects/3?timeZone=Asia%2FSeoul",
    );
    expect(request.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(request.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it("기간 조회는 양 끝 날짜와 기기 시간대를 전송한다", async () => {
    request.mockResolvedValue(Response.json([]));

    await expect(
      listPlannerDays({ from: "2026-11-02", to: "2026-11-08" }, { timeZone: "America/New_York" }),
    ).resolves.toEqual([]);

    expect(request.mock.calls[0]?.[0]).toBe(
      "/api/planner?from=2026-11-02&to=2026-11-08&timeZone=America%2FNew_York",
    );
  });

  it("요약은 새 플래너 경로에서 공부 여부와 할 일 여부를 받는다", async () => {
    request.mockResolvedValue(
      Response.json([
        {
          date: "2026-11-06",
          taskCount: 3,
          completedCount: 1,
          studySec: 3600,
          focusSec: 3000,
          studied: true,
          hasTasks: true,
          goalSec: 14400,
        },
      ]),
    );
    const days = await getPlannerSummary(
      { from: "2026-11-02", to: "2026-11-08" },
      { timeZone: "Asia/Seoul" },
    );
    expect(request.mock.calls[0]?.[0]).toBe(
      "/api/planner/summary?from=2026-11-02&to=2026-11-08&timeZone=Asia%2FSeoul",
    );
    expect(days[0]).toMatchObject({ studied: true, hasTasks: true, focusSec: 3000 });
  });
});
