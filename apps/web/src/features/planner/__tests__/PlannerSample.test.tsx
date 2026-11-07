import { afterEach, expect, it, vi } from "vitest";
import { startPlannerSample } from "../plannerSampleSetup";
import { plannerDay, plannerSubject, plannerTask } from "@/test/plannerFixtures";
import type * as TokenSourceModule from "@/lib/auth/tokenSource";
import type { AuthSnapshot, TokenSource } from "@/lib/auth/tokenSource";

const auth = vi.hoisted(() => ({ source: null as TokenSource | null }));
vi.mock("@/lib/auth/tokenSource", async (original) => ({
  ...(await original<typeof TokenSourceModule>()),
  getTokenSource: () => auth.source,
}));
afterEach(() => {
  auth.source = null;
  vi.unstubAllGlobals();
});

function signedIn() {
  let snapshot: AuthSnapshot = { userId: 7, accessToken: "old-token" };
  const listeners = new Set<(value: AuthSnapshot) => void>();
  auth.source = {
    getAccessToken: async () => snapshot.accessToken,
    getCurrentToken: () => snapshot.accessToken,
    refresh: async () => snapshot.accessToken,
    getUserId: () => snapshot.userId,
    hasSettled: () => true,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    listeners,
    change(userId: number, accessToken: string) {
      snapshot = { userId, accessToken };
      listeners.forEach((listener) => listener(snapshot));
    },
  };
}

const sample = [{ subject: "수학", task: "개념 1단원" }];
function sampleResponse(index: number) {
  return index === 0
    ? Response.json([])
    : index === 1
      ? Response.json({ id: 3, name: "수학", colorIndex: 2, studySec: 0, focusSec: 0, tasks: [] })
      : index === 2
        ? new Response(null, { status: 204 })
        : index === 3
          ? Response.json(plannerDay())
          : Response.json(plannerTask());
}

it.each([0, 1, 2, 3, 4])(
  "예시 생성 단계 %s 응답 중 계정이 바뀌면 다음 단계의 요청을 보내지 않는다",
  async (step) => {
    const identity = signedIn();
    let finish!: (response: Response) => void;
    const waiting = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const requests: { signal: AbortSignal | null | undefined; token: string | null }[] = [];
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const index = requests.length;
      requests.push({
        signal: init?.signal,
        token: new Headers(init?.headers).get("Authorization"),
      });
      return index === step ? waiting : sampleResponse(index);
    });
    vi.stubGlobal("fetch", fetcher);
    const running = startPlannerSample(
      "2026-11-06",
      [...sample, { subject: "국어", task: "문학" }],
      { timeZone: "Asia/Seoul" },
    );
    await vi.waitFor(() => expect(requests).toHaveLength(step + 1));
    identity.change(8, "new-account-token");
    expect(requests[step]!.signal?.aborted).toBe(true);
    finish(sampleResponse(step));
    await expect(running).rejects.toThrow();
    expect(requests).toHaveLength(step + 1);
    expect(requests.every((request) => request.token === "Bearer old-token")).toBe(true);
    expect(identity.listeners.size).toBe(0);
  },
);

it.each([0, 1, 2])(
  "단계 %s의 401 응답 전에 계정이 바뀌어도 새 토큰으로 재전송하지 않는다",
  async (step) => {
    const identity = signedIn();
    let finish!: (response: Response) => void;
    const waiting = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    let index = 0;
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => {
      const current = index++;
      return current === step ? waiting : sampleResponse(current);
    });
    vi.stubGlobal("fetch", fetcher);
    const running = startPlannerSample("2026-11-06", sample, { timeZone: "Asia/Seoul" });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(step + 1));
    identity.change(8, "new-account-token");
    finish(Response.json({ message: "expired" }, { status: 401 }));
    await expect(running).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(step + 1);
    expect(identity.listeners.size).toBe(0);
  },
);

it("같은 계정의 토큰 갱신은 401 재시도와 남은 예시 생성을 허용한다", async () => {
  const identity = signedIn();
  let finish!: (response: Response) => void;
  const waiting = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const requests: { signal: AbortSignal | null | undefined; token: string | null }[] = [];
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    const index = requests.length;
    requests.push({ signal: init?.signal, token: new Headers(init?.headers).get("Authorization") });
    return index === 0 ? waiting : sampleResponse(index - 1);
  });
  vi.stubGlobal("fetch", fetcher);
  const running = startPlannerSample("2026-11-06", sample, { timeZone: "Asia/Seoul" });
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  identity.change(7, "refreshed-token");
  finish(Response.json({ message: "expired" }, { status: 401 }));
  await running;
  expect(requests).toHaveLength(6);
  expect(requests[0]!.token).toBe("Bearer old-token");
  expect(requests.slice(1).every((request) => request.token === "Bearer refreshed-token")).toBe(
    true,
  );
  expect(requests.every((request) => request.signal?.aborted === false)).toBe(true);
  expect(identity.listeners.size).toBe(0);
});

it("예시의 두 번째 할 일 저장 실패 뒤 재시도해도 성공한 과목과 할 일을 다시 만들지 않는다", async () => {
  const subjects: {
    id: number;
    name: string;
    colorIndex: number;
    studySec: number;
    focusSec: number;
    tasks: [];
  }[] = [];
  let day = plannerDay();
  let fail = true;
  let subjectCreates = 0;
  let taskCreates = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (url.includes("/api/subjects") && method === "GET") return Response.json(subjects);
      if (url.includes("/api/subjects") && method === "POST") {
        subjectCreates++;
        const subject = {
          id: subjects.length + 1,
          name: body.name,
          colorIndex: 0,
          studySec: 0,
          focusSec: 0,
          tasks: [] as [],
        };
        subjects.push(subject);
        return Response.json(subject);
      }
      if (url.includes("/api/planner/days/") && method === "GET") return Response.json(day);
      if (method === "PUT") return new Response(null, { status: 204 });
      if (url.includes("/api/planner/tasks") && method === "POST") {
        if (body.subjectId === 2 && fail) {
          fail = false;
          return Response.json({ message: "failed" }, { status: 500 });
        }
        taskCreates++;
        day = {
          ...day,
          subjects: [
            ...day.subjects.filter((value) => value.id !== body.subjectId),
            plannerSubject({
              id: body.subjectId,
              tasks: [plannerTask({ subjectId: body.subjectId, name: body.name })],
            }),
          ],
        };
        return Response.json(plannerTask({ subjectId: body.subjectId, name: body.name }));
      }
      return Response.json({}, { status: 404 });
    }),
  );
  const sample = [
    { subject: "국어", task: "문학 1강 듣기" },
    { subject: "수학", task: "개념 1단원 풀기" },
  ];
  await expect(
    startPlannerSample("2026-11-06", sample, { timeZone: "Asia/Seoul" }),
  ).rejects.toThrow();
  await startPlannerSample("2026-11-06", sample, { timeZone: "Asia/Seoul" });
  expect(subjectCreates).toBe(2);
  expect(taskCreates).toBe(2);
  expect(day.subjects.map((value) => value.tasks[0]?.name)).toEqual([
    "문학 1강 듣기",
    "개념 1단원 풀기",
  ]);
});
