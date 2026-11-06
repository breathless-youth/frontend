import { describe, expect, it } from "vitest";

import type {
  ActiveSessionSnapshotResponse,
  StatusEventPayload,
  StudySessionListResponse,
  StudySessionResponse,
  SubjectResponse,
  TaskResponse,
} from "@focusmakers/types";

import { buildActiveSnapshotRequest } from "@/features/study-session/reportActiveSession";
import { buildSessionRequest } from "@/features/study-session/submitStudySession";
import {
  createSubjectSegmentTracker,
  deriveSubjectTotals,
  materializeSubjectSegments,
  selectSubjectSegment,
} from "@/features/study-session/subjectSegments";
import { assemblePlannerDay } from "@/features/planner/plannerDay";
import { subjectRefMap } from "@/features/records/recordsTimetable";

/**
 * 프론트와 백엔드를 실제로 왕복하는 통합 테스트 — 로컬 백엔드에 프론트의 실제 요청 빌더·구간 트래커로
 * 회원 등록 → 과목·할 일 → 스냅샷 → 복구 → 제출 → 일간 조회를 왕복시키고, 응답을 기록 탭 헬퍼에 그대로 넣는다.
 * 실행: BE_BASE_URL=http://localhost:8080 pnpm --filter web exec vitest run src/__integration__
 */
const BASE = process.env.BE_BASE_URL;

async function call<T>(
  token: string | null,
  version: "1" | "2",
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: T }> {
  const headers: Record<string, string> = { "API-Version": version };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: (text.length > 0 ? JSON.parse(text) : null) as T };
}

const kstDateKey = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!BASE)("기록 탭 v2 명세 — 프론트 빌더로 실제 백엔드를 왕복한다", () => {
  it("스냅샷 → 복구 → 제출 → 일간 조회가 과목 구간·이름·색·완료 할 일을 그대로 싣는다", async () => {
    // 1) 익명 기기 등록 → 토큰
    const registered = await call<{ accessToken: string }>(null, "2", "POST", "/api/users", {
      deviceId: crypto.randomUUID(),
    });
    expect(registered.status).toBe(201);
    const token = registered.json.accessToken;

    // 2) 과목 둘 + 영어에 할 일 하나(완료)
    const english = await call<SubjectResponse>(token, "1", "POST", "/api/subjects", {
      name: "영어",
    });
    const math = await call<SubjectResponse>(token, "1", "POST", "/api/subjects", { name: "수학" });
    expect(english.status).toBe(201);
    expect(math.status).toBe(201);
    const task = await call<TaskResponse>(
      token,
      "1",
      "POST",
      `/api/subjects/${english.json.id}/tasks`,
      {
        name: "문제집 1장 풀기",
      },
    );
    expect(task.status).toBe(201);
    const completed = await call<TaskResponse>(
      token,
      "1",
      "PATCH",
      `/api/subjects/${english.json.id}/tasks/${task.json.id}`,
      { done: true },
    );
    expect(completed.status).toBe(200);
    expect(completed.json.doneAt).not.toBeNull();
    const doneAtMs = Date.parse(completed.json.doneAt!);
    expect(Number.isFinite(doneAtMs)).toBe(true);

    // 3) 세션: 2~3시간 전 정각 시작, 영어 30분 → 수학. PHONE 10~15분
    // 한 시간짜리 구간을 정각에 맞춰 자정·05시를 걸쳐 쪼개지는 실행 시각 의존성을 없앤다.
    const startedAtMs = Math.floor((Date.now() - 2 * 3600_000) / 3600_000) * 3600_000;
    const dateKey = kstDateKey(startedAtMs);
    let tracker = createSubjectSegmentTracker();
    tracker = selectSubjectSegment(tracker, english.json.id, startedAtMs);
    tracker = selectSubjectSegment(tracker, math.json.id, startedAtMs + 30 * 60_000);
    const events: StatusEventPayload[] = [
      {
        status: "PHONE",
        startedAt: new Date(startedAtMs + 10 * 60_000).toISOString(),
        endedAt: new Date(startedAtMs + 15 * 60_000).toISOString(),
      },
    ];

    // 스냅샷(40분 시점) — 프론트 빌더 그대로
    const reportedAtMs = startedAtMs + 40 * 60_000;
    const snapshot = buildActiveSnapshotRequest({
      startedAtMs,
      reportedAtMs,
      studySec: 2400,
      focusSec: 2100,
      events,
      subjectSegments: materializeSubjectSegments(tracker, reportedAtMs),
    });
    expect(snapshot.subjectSegments).toHaveLength(2);
    expect((await call(token, "2", "PUT", "/api/study-sessions/active", snapshot)).status).toBe(
      204,
    );

    // 4) 복구 — 버퍼 flush를 기다린 뒤 시작 순으로 돌아오고, 마지막 원소(수학)가 선택으로 되살아난다
    let restored: { status: number; json: ActiveSessionSnapshotResponse } | null = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      restored = await call<ActiveSessionSnapshotResponse>(
        token,
        "2",
        "GET",
        "/api/study-sessions/active",
      );
      if (restored.status === 200) break;
      await sleep(1000);
    }
    expect(restored?.status).toBe(200);
    const restoredSegments = restored!.json.subjectSegments ?? [];
    expect(restoredSegments.map((s) => s.subjectId)).toEqual([english.json.id, math.json.id]);
    const revived = createSubjectSegmentTracker(
      restoredSegments,
      Date.parse(restored!.json.reportedAt),
    );
    expect(revived.current?.subjectId).toBe(math.json.id);

    // 5) 최종 제출(60분) — 프론트 빌더 그대로
    const endedAtMs = startedAtMs + 60 * 60_000;
    const request = buildSessionRequest({
      startedAtMs,
      endedAtMs,
      studySec: 3600,
      focusSec: 3300,
      events,
      subjectSegments: materializeSubjectSegments(tracker, endedAtMs),
      completedTaskIds: [task.json.id],
    });
    const created = await call<StudySessionResponse[]>(
      token,
      "2",
      "POST",
      "/api/study-sessions",
      request,
    );
    expect(created.status).toBe(201);
    const session = created.json[0]!;
    // 서버 계산: 영어 30분 − PHONE 5분 → study 1800 / focus 1500, 수학 30분 → 1800/1800
    expect(session.subjectSegments?.map((s) => [s.subjectId, s.studySec, s.focusSec])).toEqual([
      [english.json.id, 1800, 1500],
      [math.json.id, 1800, 1800],
    ]);
    expect(session.completedTasks?.[0]).toMatchObject({
      id: task.json.id,
      name: "문제집 1장 풀기",
      subjectId: english.json.id,
      deleted: false,
    });
    expect(session.subjects?.map((s) => s.name)).toEqual(["영어", "수학"]);

    // 프론트가 화면에 보여주던 로컬 파생값이 서버 계산과 같다
    const local = deriveSubjectTotals(request.subjectSegments ?? [], events);
    expect(local.get(english.json.id)).toEqual({ studySec: 1800, focusSec: 1500 });
    expect(local.get(math.json.id)).toEqual({ studySec: 1800, focusSec: 1800 });

    // 6) 일간 조회 → 기록 탭 헬퍼에 그대로 넣는다
    const stats = await call<StudySessionListResponse>(
      token,
      "2",
      "GET",
      `/api/stats?date=${dateKey}`,
    );
    expect(stats.status).toBe(200);
    expect(stats.json.sessionCount).toBe(1);
    const refs = subjectRefMap(stats.json.subjects);
    expect(refs.get(english.json.id)?.name).toBe("영어");
    expect(refs.get(math.json.id)?.colorIndex).toBe(math.json.colorIndex);
    // 실제 날짜별 응답 두 개를 그대로 조립한다. 기대 날짜는 KST에서 5시간을 빼 독립적으로 정한다.
    const statsByDate = new Map([[dateKey, stats.json]]);
    const readStats = async (key: string) => {
      const cached = statsByDate.get(key);
      if (cached !== undefined) return cached;
      const response = await call<StudySessionListResponse>(
        token,
        "2",
        "GET",
        `/api/stats?date=${key}`,
      );
      expect(response.status).toBe(200);
      statsByDate.set(key, response.json);
      return response.json;
    };
    const readPlannerDay = async (key: string) => {
      const nextKey = kstDateKey(Date.parse(`${key}T00:00:00+09:00`) + 24 * 3600_000);
      return assemblePlannerDay(key, await readStats(key), await readStats(nextKey), "Asia/Seoul");
    };
    const plannerKey = kstDateKey(startedAtMs - 5 * 3600_000);
    const day = await readPlannerDay(plannerKey);
    // 과목별 시간은 순공 기준이다.
    expect(day.studySec).toBe(3600);
    expect(day.focusSec).toBe(3300);
    expect(day.subjectRows).toEqual([
      { subjectId: english.json.id, focusSec: 1500 },
      { subjectId: math.json.id, focusSec: 1800 },
    ]);
    // 할 일은 과거 세션 시각이 아니라 서버의 실제 완료 시각이 속한 05시 하루에 보인다.
    const completedPlannerKey = kstDateKey(doneAtMs - 5 * 3600_000);
    const completedDay = await readPlannerDay(completedPlannerKey);
    const expectedCompletedTasks = [
      {
        id: task.json.id,
        name: "문제집 1장 풀기",
        subjectId: english.json.id,
        doneAtMs,
      },
    ];
    expect(completedDay.completedTasks).toEqual(expectedCompletedTasks);
    expect(day.completedTasks).toEqual(
      plannerKey === completedPlannerKey ? expectedCompletedTasks : [],
    );
    const previousCompletedKey = kstDateKey(doneAtMs - 5 * 3600_000 - 24 * 3600_000);
    expect((await readPlannerDay(previousCompletedKey)).completedTasks).toEqual([]);

    const paintAt = (minutesFromStart: number) => {
      const ms = startedAtMs + minutesFromStart * 60_000;
      const paint = day.paints.find((item) => ms >= item.startMs && ms < item.endMs);
      return paint === undefined
        ? null
        : paint.kind === "subject"
          ? { kind: paint.kind, subjectId: paint.subjectId }
          : { kind: paint.kind };
    };
    expect(paintAt(5)).toEqual({ kind: "subject", subjectId: english.json.id });
    // PHONE 5분도 과목색으로 이어 칠하되 위 순공 합계에서는 빠진다.
    expect(paintAt(12)).toEqual({ kind: "subject", subjectId: english.json.id });
    expect(paintAt(35)).toEqual({ kind: "subject", subjectId: math.json.id });
    expect(paintAt(61)).toBeNull();
  }, 60_000);
});
