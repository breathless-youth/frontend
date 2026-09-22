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
import {
  completedTasksOf,
  dayTimetable,
  kstDayStartMs,
  subjectRefMap,
  subjectTotalsOf,
} from "@/features/records/recordsTimetable";

/**
 * FE ↔ BE 계약 통합 테스트(BY-735, 임시) — 로컬 백엔드(BY-734 브랜치)에 프론트의 실제 요청 빌더·구간 트래커로
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

describe.skipIf(!BASE)("기록 탭 v2 계약 — 프론트 빌더로 실제 백엔드를 왕복한다", () => {
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
    expect(
      (
        await call(token, "1", "PATCH", `/api/subjects/${english.json.id}/tasks/${task.json.id}`, {
          done: true,
        })
      ).status,
    ).toBe(200);

    // 3) 세션: 2시간 전 시작, 영어 30분 → 수학. PHONE 10~15분
    const startedAtMs = Date.now() - 2 * 3600_000;
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

    // 6) 일간 조회 한 번 → 기록 탭 헬퍼에 그대로 넣는다
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
    expect(subjectTotalsOf(stats.json.sessions)).toEqual([
      { subjectId: english.json.id, studySec: 1800, focusSec: 1500 },
      { subjectId: math.json.id, studySec: 1800, focusSec: 1800 },
    ]);
    expect(completedTasksOf(stats.json.sessions).map((t) => t.name)).toEqual(["문제집 1장 풀기"]);

    const slots = dayTimetable(stats.json.sessions, dateKey);
    const slotAt = (minutesFromStart: number) =>
      slots[
        Math.floor((startedAtMs + minutesFromStart * 60_000 - kstDayStartMs(dateKey)) / 120_000)
      ];
    expect(slotAt(5)).toEqual({ kind: "subject", subjectId: english.json.id });
    expect(slotAt(12)).toEqual({ kind: "rest", status: "PHONE" });
    expect(slotAt(35)).toEqual({ kind: "subject", subjectId: math.json.id });
    expect(slotAt(61)).toEqual({ kind: "empty" });
  }, 60_000);
});
