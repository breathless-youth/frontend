import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SubjectResponse } from "@focusmakers/types";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { PlannerPage } from "@/routes/PlannerPage";
import "@/features/planner/record-edit/PlannerRecordEditor";
import { plannerDay, plannerRecord, plannerSubject, plannerTask } from "@/test/plannerFixtures";
import { showCtaToast } from "@/lib/toast";
import { plannerKeys } from "@/lib/plannerQueries";

const identity = vi.hoisted(() => ({
  userId: 7 as number | null,
  listeners: new Set<() => void>(),
}));
vi.mock("@/lib/userId", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    identity.listeners.add(listener);
    return () => identity.listeners.delete(listener);
  };
  return {
    useUserId: () => useSyncExternalStore(subscribe, () => identity.userId),
    hasTokenSource: () => true,
  };
});
vi.mock("@/lib/toast", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  showToast: vi.fn(),
  showCtaToast: vi.fn(),
}));
vi.mock("@/lib/amplitude", () => ({
  trackPlannerOpened: vi.fn(),
  trackPlannerDateChanged: vi.fn(),
  trackScreenBackPressed: vi.fn(),
  trackErrorRetryPressed: vi.fn(),
  setSubjectsUserProperties: vi.fn(),
  trackSubjectItemAdded: vi.fn(),
}));

let requests: { url: string; method: string; body: unknown }[];
let current = plannerDay();
let globalSubjects: SubjectResponse[] = [];
let subjectRenameConflict = false;
let followRequestedDate = false;
beforeEach(() => {
  identity.userId = 7;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T12:00:00+09:00"));
  requests = [];
  globalSubjects = [];
  subjectRenameConflict = false;
  followRequestedDate = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({
        url: String(url),
        method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (String(url).includes("/api/planner/days/")) {
        const date = String(url).match(/\/days\/(\d{4}-\d{2}-\d{2})/)?.[1];
        if (followRequestedDate && date) {
          return Response.json({
            ...current,
            date,
            records: [
              plannerRecord({
                key: `c:${date}`,
                startedAt: `${date}T00:13:00Z`,
                endedAt: `${date}T00:${date === "2026-11-05" ? "29" : "45"}:00Z`,
                subjectSegments: [],
              }),
            ],
          });
        }
        return new Response(JSON.stringify(current));
      }
      if (String(url).includes("/api/planner/summary")) return Response.json([]);
      if (String(url).includes("/api/subjects")) {
        if (subjectRenameConflict && method === "PATCH")
          return Response.json({ code: "CONFLICT", message: "duplicate" }, { status: 409 });
        return Response.json(globalSubjects);
      }
      if (String(url).includes("/api/planner/tasks") && method === "POST")
        return Response.json(plannerTask({ subjectId: 4 }));
      return new Response("{}", { status: 404 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function mount(date = "2026-11-06") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/planner?date=${date}`]}>
        <PlannerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

function mountCachedAccounts(date: string, withRecords = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  for (const userId of [7, 8]) {
    client.setQueryData(
      plannerKeys.day(userId, date, "Asia/Seoul"),
      plannerDay({
        date,
        subjects: [
          plannerSubject({ id: userId === 7 ? 3 : 4, name: userId === 7 ? "수학" : "영어" }),
        ],
        records: withRecords
          ? [
              plannerRecord({
                key: userId === 7 ? "c:account-a" : "c:account-b",
                startedAt: `${date}T${userId === 7 ? "00:13" : "01:07"}:00Z`,
                endedAt: `${date}T${userId === 7 ? "00:29" : "01:22"}:00Z`,
                subjectSegments: [],
              }),
            ]
          : [],
      }),
    );
    client.setQueryData(["subjects", userId], []);
  }
  const page = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/planner?date=${date}`]}>
        <PlannerPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  render(page());
  return {
    client,
    switchAccount() {
      act(() => {
        identity.userId = 8;
        identity.listeners.forEach((listener) => listener());
      });
    },
  };
}

it("같은 날짜의 새 계정 캐시가 있어도 이전 계정의 기록 초안과 편집 선택을 정리한다", async () => {
  const { client, switchAccount } = mountCachedAccounts("2026-11-05", true);
  await userEvent.click(await screen.findByRole("button", { name: "기록 고치기" }));
  fireEvent.click((await screen.findAllByRole("button", { name: /09:13.*09:29/ }))[0]!);
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "09:30" } });
  expect(screen.getByLabelText("끝")).toHaveValue("09:30");

  switchAccount();

  expect(await screen.findByTestId("planner-page")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "선택한 기록" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "기록 고치기" }));
  fireEvent.click((await screen.findAllByRole("button", { name: /10:07.*10:22/ }))[0]!);
  expect(screen.getByLabelText("끝")).toHaveValue("10:22");
  expect(screen.queryAllByRole("button", { name: /09:13.*09:30/ })).toHaveLength(0);
  expect(requests).toEqual([]);
  client.clear();
});

it.each(["goal", "task"])("계정이 바뀌면 열린 %s 시트와 입력 초안을 정리한다", async (sheet) => {
  const { client, switchAccount } = mountCachedAccounts("2026-11-06");
  const openSheet = () =>
    userEvent.click(
      screen.getByRole("button", {
        name: sheet === "goal" ? "+ 정하기" : "할 일 추가",
      }),
    );
  await openSheet();
  await screen.findByRole("dialog");
  if (sheet === "goal") {
    await userEvent.click(screen.getByRole("button", { name: "6시간" }));
    expect(screen.getByRole("status")).toHaveAccessibleName("6시간");
  } else {
    fireEvent.change(await screen.findByRole("textbox", { name: "할 일 이름" }), {
      target: { value: "이전 계정 초안" },
    });
  }

  switchAccount();

  expect(await screen.findByTestId("planner-page")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await openSheet();
  await screen.findByRole("dialog");
  if (sheet === "goal") expect(screen.getByRole("status")).toHaveAccessibleName("0분");
  else expect(await screen.findByRole("textbox", { name: "할 일 이름" })).toHaveValue("");
  expect(requests.every((request) => request.method === "GET")).toBe(true);
  client.clear();
});

it("기록 고치기에서 날짜를 바꾸면 새 날짜의 기록 편집을 유지한다", async () => {
  followRequestedDate = true;
  const client = mount("2026-11-05");
  await userEvent.click(await screen.findByRole("button", { name: "기록 고치기" }));
  await screen.findAllByRole("button", { name: /09:13.*09:29/ });
  await userEvent.click(screen.getByRole("button", { name: "날짜 고르기" }));
  const calendar = await screen.findByRole("dialog");
  await userEvent.click(within(calendar).getByRole("button", { name: /11월 4일/ }));
  expect((await screen.findAllByRole("button", { name: /09:13.*09:45/ }))[0]).toBeInTheDocument();
  expect(screen.queryByTestId("planner-page")).not.toBeInTheDocument();
  expect(screen.queryAllByRole("button", { name: /09:13.*09:29/ })).toHaveLength(0);
  expect(requests.every((request) => request.method === "GET")).toBe(true);
  client.clear();
});

it("일간 추가 시트에서도 오늘에 아직 없는 다른 내 과목으로 계획을 만든다", async () => {
  current = plannerDay({ subjects: [plannerSubject()] });
  globalSubjects = [
    { id: 3, name: "수학", colorIndex: 2, studySec: 0, focusSec: 0, tasks: [] },
    { id: 4, name: "영어", colorIndex: 1, studySec: 0, focusSec: 0, tasks: [] },
  ];
  const client = mount();
  await userEvent.click(await screen.findByRole("button", { name: "할 일 추가" }));
  await userEvent.click(await screen.findByRole("button", { name: "영어" }, { timeout: 10000 }));
  await userEvent.type(screen.getByRole("textbox", { name: "할 일 이름" }), "단어 복습");
  await userEvent.click(screen.getByRole("button", { name: "추가" }));
  await waitFor(() =>
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: "POST",
        body: { date: "2026-11-06", subjectId: 4, name: "단어 복습" },
      }),
    ),
  );
  client.clear();
});

it("미래 날짜의 계획만 표시하고 완료 요청은 보내지 않는다", async () => {
  current = plannerDay({
    subjects: [plannerSubject({ tasks: [plannerTask({ name: "내일 계획" })] })],
  });
  const client = mount();
  await screen.findByText("내일 계획");
  await userEvent.click(screen.getByRole("checkbox", { name: "내일 계획" }));
  expect(showCtaToast).toHaveBeenCalledWith("아직 할 일을 완료할 수 없어요");
  expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
  expect(requests.some((request) => request.url.includes("/api/stats"))).toBe(false);
  expect(screen.queryByRole("button", { name: "기록 고치기" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "+ 정하기" })).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "일간" })).toHaveAttribute("aria-selected", "true"),
  );
  client.clear();
});

it("중복된 과목 이름으로 변경하면 이름 중복을 안내하고 초안을 유지한다", async () => {
  current = plannerDay({ subjects: [plannerSubject()] });
  subjectRenameConflict = true;
  const client = mount();
  (await screen.findByRole("button", { name: "수학" })).focus();
  await userEvent.keyboard("{Enter}");
  await userEvent.click(screen.getByRole("menuitem", { name: "이름 변경" }));
  const input = await screen.findByRole("textbox", { name: "과목 이름" });
  await userEvent.clear(input);
  await userEvent.type(input, "영어");
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("이미 같은 이름의 과목이 있어요");
  expect(input).toHaveValue("영어");
  await userEvent.type(input, " 복습");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(requests.filter((request) => request.url.includes("/api/planner/days/"))).toHaveLength(1);
  client.clear();
});

it("과목 이름을 바꾸면 전체 과목 API로 저장하고 그날 계획을 다시 조회한다", async () => {
  current = plannerDay({ subjects: [plannerSubject()] });
  const client = mount();
  (await screen.findByRole("button", { name: "수학" })).focus();
  await userEvent.keyboard("{Enter}");
  await userEvent.click(screen.getByRole("menuitem", { name: "이름 변경" }));
  const input = await screen.findByRole("textbox", { name: "과목 이름" });
  await userEvent.clear(input);
  await userEvent.type(input, "확률과 통계");
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() =>
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: "PATCH",
        url: expect.stringContaining("/api/subjects/3"),
        body: { name: "확률과 통계" },
      }),
    ),
  );
  await waitFor(() =>
    expect(
      requests.filter((request) => request.url.includes("/api/planner/days/")).length,
    ).toBeGreaterThan(1),
  );
  client.clear();
});

it("할 일이 남은 과목은 확인 뒤 그 날짜에서만 뺀다", async () => {
  current = plannerDay({
    subjects: [
      plannerSubject({
        tasks: [plannerTask(), plannerTask({ key: "t:13", taskId: 13, name: "오답" })],
      }),
    ],
  });
  const client = mount();
  (await screen.findByRole("button", { name: "수학" })).focus();
  await userEvent.keyboard("{Enter}");
  await userEvent.click(screen.getByRole("menuitem", { name: "이 날에서 빼기" }));
  expect(screen.getByRole("alertdialog", { name: "수학을 이 날에서 뺄까요?" })).toBeInTheDocument();
  expect(screen.getByText("할 일 2개도 함께 사라져요")).toBeInTheDocument();
  expect(requests.filter((request) => request.method === "DELETE")).toHaveLength(0);
  await userEvent.click(screen.getByRole("button", { name: "빼기" }));
  await waitFor(() =>
    expect(requests.filter((request) => request.method === "DELETE")).toEqual([
      expect.objectContaining({
        url: expect.stringContaining("/api/planner/days/2026-11-06/subjects/3?"),
      }),
    ]),
  );
  client.clear();
});

it("공부 기록이 있는 과목에는 그날에서 빼기를 제공하지 않는다", async () => {
  current = plannerDay({
    date: "2026-11-05",
    records: [plannerRecord()],
    subjects: [plannerSubject()],
  });
  const client = mount("2026-11-05");
  (await screen.findByRole("button", { name: /수학/ })).focus();
  await userEvent.keyboard("{Enter}");
  expect(screen.queryByRole("menuitem", { name: "이 날에서 빼기" })).not.toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "과목 삭제" })).toBeInTheDocument();
  client.clear();
});

it("과목을 끌어 순서를 바꾸면 그 날짜의 순서만 저장한다", async () => {
  class Pointer extends MouseEvent {
    readonly isPrimary = true;
    readonly pointerId = 1;
    readonly pointerType = "touch";
  }
  vi.stubGlobal("PointerEvent", Pointer);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  current = plannerDay({ subjects: [plannerSubject(), plannerSubject({ id: 8, name: "영어" })] });
  const client = mount();
  const first = await screen.findByRole("button", { name: "수학" });
  const second = screen.getByRole("button", { name: "영어" });
  const original = document.elementFromPoint;
  document.elementFromPoint = () => second;
  try {
    fireEvent.pointerDown(first, { clientX: 20, clientY: 40 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 520));
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.pointerMove(first, { clientX: 20, clientY: 120 });
    fireEvent.pointerUp(first, { clientX: 20, clientY: 120 });
    await waitFor(() =>
      expect(requests).toContainEqual(
        expect.objectContaining({
          method: "PUT",
          url: expect.stringContaining("/api/planner/days/2026-11-06/subjects/order?"),
          body: { subjectIds: [8, 3] },
        }),
      ),
    );
    expect(requests.some((request) => request.url.includes("/api/subjects/order"))).toBe(false);
  } finally {
    document.elementFromPoint = original;
    client.clear();
  }
});
