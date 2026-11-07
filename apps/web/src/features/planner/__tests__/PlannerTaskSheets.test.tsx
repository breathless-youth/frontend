import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlannerTaskSheets } from "../PlannerTaskSheets";
import { plannerDay, plannerSubject, plannerTask } from "@/test/plannerFixtures";
import { plannerKeys } from "@/lib/plannerQueries";

let client: QueryClient;
const request = vi.fn<typeof fetch>();
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.stubGlobal("fetch", request);
  request.mockReset();
  request.mockImplementation(async (input) => {
    const url = String(input);
    const date = url.match(/\/days\/(\d{4}-\d{2}-\d{2})\?/)?.[1];
    return Response.json(date ? plannerDay({ date, subjects: [plannerSubject()] }) : plannerTask());
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

it("실제 키보드가 떠도 반복 요일과 종료일을 바로 보여 주고 시트를 보이는 영역에 맞춘다", () => {
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerHeight", 800);
  render(
    <QueryClientProvider client={client}>
      <PlannerTaskSheets
        open
        onOpenChange={() => {}}
        userId={7}
        dateKey="2026-11-06"
        todayKey="2026-11-05"
        task={null}
        subjectId={3}
        subjects={[plannerSubject()]}
        onStudyStart={() => {}}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("textbox", { name: "할 일 이름" })).toHaveFocus();
  expect(screen.getByRole("group", { name: "반복 요일" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "반복 종료일" })).toBeInTheDocument();
  act(() => {
    viewport.height = 458;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(screen.getByRole("group", { name: "반복 요일" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "반복 종료일" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "반복" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog")).toHaveStyle({
    marginBottom: "342px",
    maxHeight: "calc(458px - max(24px, env(safe-area-inset-top)))",
  });
  act(() => {
    viewport.height = 800;
    viewport.dispatchEvent(new Event("resize"));
  });
  const input = screen.getByRole("textbox", { name: "할 일 이름" });
  expect(input).toHaveFocus();
  fireEvent.pointerDown(input);
  expect(screen.getByRole("group", { name: "반복 요일" })).toBeInTheDocument();
  fireEvent.pointerUp(input);
  fireEvent.click(input);
  act(() => {
    viewport.height = 458;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(screen.getByRole("group", { name: "반복 요일" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "반복 종료일" })).toBeInTheDocument();
  expect(input).toHaveFocus();
});

it("이미 줄어든 창에서는 viewport 이동량을 중복 차감하지 않고 초과 안내를 표시한다", () => {
  const viewport = Object.assign(new EventTarget(), { height: 518, offsetTop: 0 });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerHeight", 518);
  render(
    <QueryClientProvider client={client}>
      <PlannerTaskSheets
        open
        onOpenChange={() => {}}
        userId={7}
        dateKey="2026-11-06"
        todayKey="2026-11-05"
        task={null}
        subjectId={3}
        subjects={[plannerSubject()]}
        onStudyStart={() => {}}
      />
    </QueryClientProvider>,
  );
  const input = screen.getByRole("textbox", { name: "할 일 이름" });
  fireEvent.change(input, { target: { value: "가".repeat(27) } });
  act(() => {
    viewport.height = 505;
    viewport.offsetTop = 355.65625;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(screen.getByRole("alert")).toHaveTextContent("25자까지 쓸 수 있어요");
  expect(screen.getByRole("button", { name: "추가" })).toBeDisabled();
  expect(screen.getByRole("dialog")).toHaveStyle({
    marginBottom: "0px",
    maxHeight: "calc(505px - max(24px, env(safe-area-inset-top)))",
  });
  // 아래 가림 높이가 0인 채 바뀌어도 보이는 높이 변경을 놓치지 않는다.
  act(() => {
    viewport.height = 480;
    viewport.offsetTop = 394;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(screen.getByRole("dialog")).toHaveStyle({
    maxHeight: "calc(480px - max(24px, env(safe-area-inset-top)))",
  });
  expect(screen.getByRole("group", { name: "반복 요일" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "반복 종료일" })).toBeInTheDocument();
  expect(input).toHaveValue("가".repeat(27));
});

it("입력과 키보드 재진입 중에도 반복 설정을 바로 고르고 초안을 보존해 저장한다", async () => {
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerHeight", 800);
  request.mockImplementation(async (input) =>
    Response.json(String(input).includes("/summary?") ? [] : plannerDay()),
  );
  render(
    <QueryClientProvider client={client}>
      <PlannerTaskSheets
        open
        onOpenChange={() => {}}
        userId={7}
        dateKey="2026-11-06"
        todayKey="2026-11-05"
        task={null}
        subjectId={3}
        subjects={[plannerSubject()]}
        onStudyStart={() => {}}
      />
    </QueryClientProvider>,
  );
  const input = screen.getByRole("textbox", { name: "할 일 이름" });
  await userEvent.type(input, "키보드 초안");
  expect(screen.getByRole("group", { name: "반복 요일" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "반복 종료일" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "반복" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "월" }));
  await userEvent.click(screen.getByRole("button", { name: "금" }));
  await userEvent.click(screen.getByRole("button", { name: "반복 종료일" }));
  await userEvent.click(screen.getByRole("radio", { name: /날짜 정하기/ }));
  await userEvent.click(screen.getByRole("button", { name: /11월 30일/ }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));

  const restoredInput = await screen.findByRole("textbox", { name: "할 일 이름" });
  expect(restoredInput).toHaveValue("키보드 초안");
  expect(restoredInput).toHaveFocus();
  fireEvent.pointerDown(restoredInput);
  act(() => {
    viewport.height = 458;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(screen.getByRole("button", { name: "월" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "금" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "반복 종료일" })).toHaveTextContent("11월 30일");
  // Android 뒤로 가기는 입력 포커스를 남긴 채 키보드만 내린다.
  act(() => {
    viewport.height = 800;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(restoredInput).toHaveFocus();
  expect(screen.getByRole("button", { name: "월" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "금" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.pointerDown(restoredInput);
  act(() => {
    viewport.height = 458;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(screen.getByRole("group", { name: "반복 요일" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "반복 종료일" })).toHaveTextContent("11월 30일");
  fireEvent.submit(restoredInput.closest("form")!);
  await waitFor(() =>
    expect(request.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body).toBe(
      JSON.stringify({
        subjectId: 3,
        date: "2026-11-06",
        name: "키보드 초안",
        repeat: { weekdays: ["MONDAY", "FRIDAY"], endDate: "2026-11-30" },
      }),
    ),
  );
});

it("추가 시트에서 반복 종료일로 바로 들어가 저장하면 이름·요일·종료일을 보존한다", async () => {
  request.mockImplementation(async (input) =>
    Response.json(String(input).includes("/summary?") ? [] : plannerDay()),
  );
  render(
    <QueryClientProvider client={client}>
      <PlannerTaskSheets
        open
        onOpenChange={() => {}}
        userId={7}
        dateKey="2026-11-06"
        todayKey="2026-11-05"
        task={null}
        subjectId={3}
        subjects={[plannerSubject()]}
        onStudyStart={() => {}}
      />
    </QueryClientProvider>,
  );
  await userEvent.type(screen.getByRole("textbox", { name: "할 일 이름" }), "초안 보존");
  await userEvent.click(screen.getByRole("button", { name: "월" }));
  await userEvent.click(screen.getByRole("button", { name: "금" }));
  await userEvent.click(screen.getByRole("button", { name: "반복 종료일" }));
  expect(screen.getByRole("heading", { name: "반복 종료일" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("radio", { name: /날짜 정하기/ }));
  await userEvent.click(screen.getByRole("button", { name: /11월 30일/ }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByRole("textbox", { name: "할 일 이름" })).toHaveValue("초안 보존");
  expect(screen.getByRole("button", { name: "월" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "금" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("button", { name: "추가" }));
  await waitFor(() =>
    expect(request.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body).toBe(
      JSON.stringify({
        subjectId: 3,
        date: "2026-11-06",
        name: "초안 보존",
        repeat: { weekdays: ["MONDAY", "FRIDAY"], endDate: "2026-11-30" },
      }),
    ),
  );
});

it("선택한 날짜의 다른 과목이 30개면 안내하고 버튼과 직접 제출 모두 막는다", async () => {
  client.setQueryDefaults(plannerKeys.user(7), { staleTime: Infinity });
  const full = plannerSubject({
    id: 8,
    name: "영어",
    tasks: Array.from({ length: 30 }, (_, i) => plannerTask({ key: `full:${i}`, subjectId: 8 })),
  });
  client.setQueryData(
    plannerKeys.day(7, "2026-11-06", "Asia/Seoul"),
    plannerDay({ subjects: [full] }),
  );
  render(
    <QueryClientProvider client={client}>
      <PlannerTaskSheets
        open
        onOpenChange={() => {}}
        userId={7}
        dateKey="2026-11-06"
        todayKey="2026-11-05"
        task={null}
        subjectId={3}
        subjects={[plannerSubject(), plannerSubject({ id: 8, name: "영어" })]}
        onStudyStart={() => {}}
      />
    </QueryClientProvider>,
  );
  const input = screen.getByRole("textbox", { name: "할 일 이름" });
  await userEvent.type(input, "한도 확인");
  await userEvent.click(screen.getByRole("button", { name: "영어" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "과목 하나에 할 일은 30개까지 넣을 수 있어요",
  );
  expect(screen.getByRole("button", { name: "추가" })).toBeDisabled();
  fireEvent.submit(input.closest("form")!);
  expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
});

it("날짜를 바꾸면 이전 날짜 과목의 30개를 새 날짜에 적용하지 않는다", async () => {
  client.setQueryDefaults(plannerKeys.user(7), { staleTime: Infinity });
  const full = plannerSubject({
    tasks: Array.from({ length: 30 }, (_, i) => plannerTask({ key: `old:${i}` })),
  });
  client.setQueryData(
    plannerKeys.day(7, "2026-11-06", "Asia/Seoul"),
    plannerDay({ subjects: [full] }),
  );
  client.setQueryData(
    plannerKeys.day(7, "2026-11-07", "Asia/Seoul"),
    plannerDay({ date: "2026-11-07", subjects: [plannerSubject()] }),
  );
  request.mockImplementation(async (input) =>
    Response.json(String(input).includes("/summary?") ? [] : plannerTask()),
  );
  render(
    <QueryClientProvider client={client}>
      <PlannerTaskSheets
        open
        onOpenChange={() => {}}
        userId={7}
        dateKey="2026-11-06"
        todayKey="2026-11-05"
        task={null}
        subjectId={3}
        subjects={[full]}
        onStudyStart={() => {}}
      />
    </QueryClientProvider>,
  );
  await userEvent.type(screen.getByRole("textbox", { name: "할 일 이름" }), "새 날짜 계획");
  expect(screen.getByRole("button", { name: "추가" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent(
    "과목 하나에 할 일은 30개까지 넣을 수 있어요",
  );
  await userEvent.click(screen.getByRole("button", { name: "11월 6일" }));
  await userEvent.click(screen.getByRole("button", { name: /11월 7일/ }));
  expect(screen.getByRole("button", { name: "추가" })).toBeEnabled();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "추가" }));
  await waitFor(() =>
    expect(request.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body).toBe(
      JSON.stringify({ subjectId: 3, date: "2026-11-07", name: "새 날짜 계획" }),
    ),
  );
});

it("선택 날짜를 아직 확인하지 못했으면 기존 저장과 서버 실패 후 재시도를 유지한다", async () => {
  let saves = 0;
  request.mockImplementation(async (_input, init) => {
    if (init?.method === "POST") {
      saves++;
      return saves === 1
        ? Response.json({ message: "task limit", code: "TASK_LIMIT_EXCEEDED" }, { status: 409 })
        : Response.json(plannerTask());
    }
    return Response.json({ message: "unavailable" }, { status: 500 });
  });
  const close = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <PlannerTaskSheets
        open
        onOpenChange={close}
        userId={7}
        dateKey="2026-11-07"
        todayKey="2026-11-05"
        task={null}
        subjectId={3}
        subjects={[
          plannerSubject({
            tasks: Array.from({ length: 30 }, (_, i) => plannerTask({ key: `old:${i}` })),
          }),
        ]}
        onStudyStart={() => {}}
      />
    </QueryClientProvider>,
  );
  const input = screen.getByRole("textbox", { name: "할 일 이름" });
  await userEvent.type(input, "서버 확인");
  expect(screen.getByRole("button", { name: "추가" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "추가" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(close).not.toHaveBeenCalled();
  expect(input).toHaveValue("서버 확인");
  await userEvent.click(screen.getByRole("button", { name: "추가" }));
  await waitFor(() => expect(close).toHaveBeenCalledWith(false));
  expect(saves).toBe(2);
});

it("과목 추가 상태는 글로벌 목록이 아니라 선택 날짜와 그날 추가한 과목을 따른다", async () => {
  client.setQueryDefaults(plannerKeys.user(7), { staleTime: Infinity });
  const math = plannerSubject();
  const english = plannerSubject({ id: 8, name: "영어", selected: false });
  let day = plannerDay({ subjects: [math, english] });
  client.setQueryData(plannerKeys.day(7, "2026-11-06", "Asia/Seoul"), day);
  client.setQueryData(
    plannerKeys.day(7, "2026-11-07", "Asia/Seoul"),
    plannerDay({ date: "2026-11-07" }),
  );
  request.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "/api/subjects") return Response.json([math, english]);
    if (url.includes("/summary?")) return Response.json([]);
    if (init?.method === "PUT") {
      day = { ...day, subjects: [math, { ...english, selected: true }] };
      return new Response(null, { status: 204 });
    }
    return Response.json(day);
  });
  render(
    <QueryClientProvider client={client}>
      <PlannerTaskSheets
        open
        onOpenChange={() => {}}
        userId={7}
        dateKey="2026-11-06"
        todayKey="2026-11-05"
        task={null}
        subjectId={3}
        subjects={[math, english]}
        onStudyStart={() => {}}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "과목" }));
  expect(await screen.findByRole("button", { name: "수학, 이미 들어 있어요" })).toBeDisabled();
  const available = screen.getByRole("button", { name: "영어" });
  expect(available).toBeEnabled();
  await userEvent.click(available);
  await userEvent.click(screen.getByRole("button", { name: "1개 추가" }));
  await screen.findByRole("textbox", { name: "할 일 이름" });
  await userEvent.click(screen.getByRole("button", { name: "과목" }));
  expect(await screen.findByRole("button", { name: "영어, 이미 들어 있어요" })).toBeDisabled();
  await userEvent.keyboard("{Escape}");
  await userEvent.click(await screen.findByRole("button", { name: "11월 6일" }));
  await userEvent.click(screen.getByRole("button", { name: /11월 7일/ }));
  await userEvent.click(screen.getByRole("button", { name: "과목" }));
  expect(await screen.findByRole("button", { name: "영어" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "수학" })).toBeEnabled();
});
it("25자는 저장하고 26자는 입력을 보존한 채 저장을 막는다", async () => {
  render(
    <QueryClientProvider client={client}>
      <PlannerTaskSheets
        open
        onOpenChange={() => {}}
        userId={7}
        dateKey="2026-11-06"
        todayKey="2026-11-05"
        task={null}
        subjectId={3}
        subjects={[plannerSubject()]}
        onStudyStart={() => {}}
      />
    </QueryClientProvider>,
  );
  const input = screen.getByRole("textbox", { name: "할 일 이름" });
  const name = "가".repeat(26);
  await userEvent.type(input, name);
  expect(input).toHaveValue(name);
  expect(screen.getByText("25자까지 쓸 수 있어요")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "추가" })).toBeDisabled();
  await userEvent.type(input, "{Backspace}");
  await userEvent.click(screen.getByRole("button", { name: "추가" }));
  await waitFor(() =>
    expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true),
  );
  const [url, init] = request.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(url).toBe("/api/planner/tasks?timeZone=Asia%2FSeoul");
  expect(JSON.parse(String(init?.body))).toEqual({
    subjectId: 3,
    date: "2026-11-06",
    name: "가".repeat(25),
  });
});

it("지난 날의 할 일 시트는 이동만 제공한다", () => {
  render(
    <QueryClientProvider client={client}>
      <PlannerTaskSheets
        open
        onOpenChange={() => {}}
        userId={7}
        dateKey="2026-11-04"
        todayKey="2026-11-05"
        task={plannerTask({ date: "2026-11-04" })}
        subjectId={3}
        subjects={[plannerSubject()]}
        onStudyStart={() => {}}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("button", { name: "다른 날로 옮기기" })).toBeInTheDocument();
  expect(screen.getByText("지난 날에는 완료와 옮기기만 할 수 있어요")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "공부 시작" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("반복 할 일 이름 변경은 범위를 확인한 뒤 FUTURE 명세로 저장한다", async () => {
  render(
    <QueryClientProvider client={client}>
      <PlannerTaskSheets
        open
        onOpenChange={() => {}}
        userId={7}
        dateKey="2026-11-06"
        todayKey="2026-11-05"
        task={plannerTask({ seriesId: 4, occurrenceDate: "2026-11-06", key: "r:4:2026-11-06" })}
        subjectId={3}
        subjects={[plannerSubject()]}
        onStudyStart={() => {}}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "이름 변경" }));
  const input = screen.getByRole("textbox", { name: "할 일 이름" });
  await userEvent.clear(input);
  await userEvent.type(input, "새 이름");
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await screen.findByRole("radio", { name: "이 날만" });
  expect(request.mock.calls.filter((call) => call[1]?.method === "PATCH")).toHaveLength(0);
  await userEvent.click(screen.getByRole("radio", { name: "이 날부터 앞으로 모두" }));
  await userEvent.click(screen.getByRole("button", { name: "바꾸기" }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  const [url, init] = request.mock.calls[0]!;
  expect(url).toContain("/api/planner/tasks/r%3A4%3A2026-11-06?");
  expect(JSON.parse(String(init?.body))).toEqual({ name: "새 이름", scope: "FUTURE" });
});

it.each(["existing", "new"] as const)(
  "%s 과목을 추가하고 돌아와도 작성한 할 일과 고른 날짜를 보존한다",
  async (kind) => {
    const english = { id: 8, name: "영어", colorIndex: 11, studySec: 0, focusSec: 0, tasks: [] };
    const physics = { id: 9, name: "물리학", colorIndex: 7, studySec: 0, focusSec: 0, tasks: [] };
    const requests: { url: string; method: string; body: unknown }[] = [];
    request.mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      if (url === "/api/subjects")
        return Response.json(init?.method === "POST" ? physics : [english]);
      if (url.includes("/summary?")) return Response.json([]);
      if (init?.method === "PUT") return new Response(null, { status: 204 });
      return Response.json(plannerTask());
    });
    render(
      <QueryClientProvider client={client}>
        <PlannerTaskSheets
          open
          onOpenChange={() => {}}
          userId={7}
          dateKey="2026-11-06"
          todayKey="2026-11-05"
          task={null}
          subjectId={3}
          subjects={[plannerSubject()]}
          onStudyStart={() => {}}
        />
      </QueryClientProvider>,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "할 일 이름" }), "작성 중인 할 일");
    await userEvent.click(screen.getByRole("button", { name: "11월 6일" }));
    await userEvent.click(screen.getByRole("button", { name: /11월 7일/ }));
    await userEvent.click(screen.getByRole("button", { name: "과목" }));
    if (kind === "existing") {
      await userEvent.click(await screen.findByRole("button", { name: "영어" }));
      await userEvent.click(screen.getByRole("button", { name: "1개 추가" }));
    } else {
      await userEvent.click(await screen.findByRole("button", { name: "새 과목" }));
      await userEvent.type(screen.getByRole("textbox", { name: "과목 이름" }), "물리학");
      await userEvent.click(screen.getByRole("button", { name: "만들기" }));
    }
    expect(await screen.findByRole("textbox", { name: "할 일 이름" })).toHaveValue(
      "작성 중인 할 일",
    );
    expect(screen.getByRole("button", { name: "11월 7일" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: kind === "existing" ? "영어" : "물리학" }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "추가" }));
    await waitFor(() =>
      expect(requests).toContainEqual({
        url: "/api/planner/tasks?timeZone=Asia%2FSeoul",
        method: "POST",
        body: {
          subjectId: kind === "existing" ? 8 : 9,
          date: "2026-11-07",
          name: "작성 중인 할 일",
        },
      }),
    );
    expect(requests).toContainEqual({
      url: `/api/planner/days/2026-11-07/subjects/${kind === "existing" ? 8 : 9}?timeZone=Asia%2FSeoul`,
      method: "PUT",
      body: undefined,
    });
  },
);

it("기존 반복의 현재 날짜 규칙을 불러와 요일과 종료일을 보존해 저장한다", async () => {
  request.mockImplementation(async (input, init) => {
    if (String(input).includes("/repeat") && (!init?.method || init.method === "GET"))
      return Response.json({
        seriesId: 4,
        startDate: "2026-11-03",
        weekdays: ["MONDAY", "FRIDAY"],
        endDate: "2026-11-30",
      });
    return Response.json(plannerTask());
  });
  render(
    <QueryClientProvider client={client}>
      <PlannerTaskSheets
        open
        onOpenChange={() => {}}
        userId={7}
        dateKey="2026-11-06"
        todayKey="2026-11-05"
        task={plannerTask({ seriesId: 4, key: "r:4:2026-11-06" })}
        subjectId={3}
        subjects={[plannerSubject()]}
        onStudyStart={() => {}}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "반복" }));
  expect(await screen.findByRole("button", { name: "월" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "금" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() =>
    expect(
      request.mock.calls.some(
        ([url, init]) =>
          String(url).includes("/repeat") &&
          init?.method === "PUT" &&
          init.body === JSON.stringify({ weekdays: ["MONDAY", "FRIDAY"], endDate: "2026-11-30" }),
      ),
    ).toBe(true),
  );
});

it("조회 실패 시 저장을 막고 다시 시도하며 이후 저장 실패에도 편집값을 보존한다", async () => {
  let gets = 0;
  let puts = 0;
  request.mockImplementation(async (input, init) => {
    if (String(input).includes("/repeat")) {
      if (init?.method === "PUT") {
        puts++;
        return puts === 1 ? Response.json({}, { status: 500 }) : Response.json(plannerTask());
      }
      gets++;
      return gets === 1
        ? Response.json({}, { status: 500 })
        : Response.json({ seriesId: 4, startDate: null, weekdays: [], endDate: null });
    }
    return Response.json(plannerTask());
  });
  const close = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <PlannerTaskSheets
        open
        onOpenChange={close}
        userId={7}
        dateKey="2026-11-06"
        todayKey="2026-11-05"
        task={plannerTask({ seriesId: 4, key: "r:4:2026-11-06" })}
        subjectId={3}
        subjects={[plannerSubject()]}
        onStudyStart={() => {}}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "반복" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("반복 설정을 불러오지 못했어요");
  expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByRole("button", { name: "안 함" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await userEvent.click(screen.getByRole("button", { name: "화" }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "화" })).toHaveAttribute("aria-pressed", "true");
  expect(close).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(close).toHaveBeenCalledWith(false));
});

it.each(["date", "key"] as const)(
  "회차 %s 변경 뒤 늦게 도착한 이전 응답을 쓰지 않는다",
  async (changed) => {
    let resolveOld!: (value: Response) => void;
    request.mockImplementation(async (input) => {
      if (String(input).includes("/repeat")) {
        if (!resolveOld)
          return new Promise<Response>((resolve) => {
            resolveOld = resolve;
          });
        return Response.json({
          seriesId: 4,
          startDate: "2026-11-07",
          weekdays: ["SATURDAY"],
          endDate: null,
        });
      }
      return Response.json(plannerTask());
    });
    const props = {
      open: true,
      onOpenChange: () => {},
      userId: 7,
      dateKey: "2026-11-06",
      todayKey: "2026-11-05",
      subjectId: 3,
      subjects: [plannerSubject()],
      onStudyStart: () => {},
    };
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <PlannerTaskSheets
          {...props}
          task={plannerTask({ seriesId: 4, key: "r:4:2026-11-06", date: "2026-11-06" })}
        />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "반복" }));
    await waitFor(() => expect(resolveOld).toBeDefined());
    rerender(
      <QueryClientProvider client={client}>
        <PlannerTaskSheets
          {...props}
          task={plannerTask({
            seriesId: 4,
            key: changed === "key" ? "r:4:2026-11-07" : "r:4:2026-11-06",
            date: changed === "date" ? "2026-11-07" : "2026-11-06",
          })}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("button", { name: "토" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    resolveOld(
      Response.json({ seriesId: 4, startDate: "2026-11-01", weekdays: ["MONDAY"], endDate: null }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "월" })).toHaveAttribute("aria-pressed", "false"),
    );
  },
);

it("반복을 저장하고 다시 열면 갱신된 요일과 종료일을 보여 준다", async () => {
  client.setDefaultOptions({
    queries: { retry: false, staleTime: Infinity },
    mutations: { retry: false },
  });
  let settings = { weekdays: ["MONDAY"], endDate: null as string | null };
  request.mockImplementation(async (input, init) => {
    if (String(input).includes("/repeat")) {
      if (init?.method === "PUT") {
        settings = JSON.parse(String(init.body));
        return Response.json(plannerTask());
      }
      return Response.json({ seriesId: 4, startDate: "2026-11-06", ...settings });
    }
    return Response.json(String(input).includes("/summary?") ? [] : plannerTask());
  });
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <>
        {!open && <button onClick={() => setOpen(true)}>다시 열기</button>}
        {open && (
          <PlannerTaskSheets
            open
            onOpenChange={setOpen}
            userId={7}
            dateKey="2026-11-06"
            todayKey="2026-11-05"
            task={plannerTask({ seriesId: 4, key: "r:4:2026-11-06" })}
            subjectId={3}
            subjects={[plannerSubject()]}
            onStudyStart={() => {}}
          />
        )}
      </>
    );
  }
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "반복" }));
  expect(await screen.findByRole("button", { name: "월" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("button", { name: "월" }));
  await userEvent.click(screen.getByRole("button", { name: "화" }));
  await userEvent.click(screen.getByRole("button", { name: "반복 종료일" }));
  await userEvent.click(screen.getByRole("radio", { name: /날짜 정하기/ }));
  await userEvent.click(screen.getByRole("button", { name: /11월 30일/ }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await userEvent.click(await screen.findByRole("button", { name: "다시 열기" }));
  await userEvent.click(screen.getByRole("button", { name: "반복" }));
  expect(await screen.findByRole("button", { name: "화" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "월" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "반복 종료일" })).toHaveTextContent("11월 30일");
});

it.each(["종료일 정정", "반복 해제"])(
  "시작 날짜를 종료일 뒤로 바꾸면 초안을 보존하고 안내한 뒤 %s으로 저장한다",
  async (correction) => {
    request.mockImplementation(async (input) => {
      const url = String(input);
      const date = url.match(/\/days\/(\d{4}-\d{2}-\d{2})\?/)?.[1];
      return Response.json(
        url.includes("/summary?")
          ? []
          : date
            ? plannerDay({ date, subjects: [plannerSubject()] })
            : plannerTask(),
      );
    });
    render(
      <QueryClientProvider client={client}>
        <PlannerTaskSheets
          open
          onOpenChange={() => {}}
          userId={7}
          dateKey="2026-11-06"
          todayKey="2026-11-05"
          task={null}
          subjectId={3}
          subjects={[plannerSubject()]}
          onStudyStart={() => {}}
        />
      </QueryClientProvider>,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "할 일 이름" }), "보존할 초안");
    await userEvent.click(screen.getByRole("button", { name: "월" }));
    await userEvent.click(screen.getByRole("button", { name: "반복 종료일" }));
    await userEvent.click(screen.getByRole("radio", { name: /날짜 정하기/ }));
    await userEvent.click(screen.getByRole("button", { name: /11월 10일/ }));
    await userEvent.click(screen.getByRole("button", { name: "저장" }));
    await userEvent.click(screen.getByRole("button", { name: "11월 6일" }));
    await userEvent.click(screen.getByRole("button", { name: /11월 20일/ }));
    expect(screen.getByRole("button", { name: "추가" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "반복 종료일이 시작 날짜보다 빨라요. 종료일을 다시 선택해 주세요.",
    );
    const input = screen.getByRole("textbox", { name: "할 일 이름" });
    expect(input).toHaveValue("보존할 초안");
    expect(screen.getByRole("button", { name: "월" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "반복 종료일" })).toHaveTextContent("11월 10일");
    fireEvent.submit(input.closest("form")!);
    expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    if (correction === "종료일 정정") {
      await userEvent.click(screen.getByRole("button", { name: "반복 종료일" }));
      await userEvent.click(screen.getByRole("button", { name: /11월 30일/ }));
      await userEvent.click(screen.getByRole("button", { name: "저장" }));
    } else {
      await userEvent.click(screen.getByRole("button", { name: "월" }));
    }
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "추가" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "추가" }));
    await waitFor(() =>
      expect(request.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body).toBe(
        JSON.stringify({
          subjectId: 3,
          date: "2026-11-20",
          name: "보존할 초안",
          ...(correction === "종료일 정정"
            ? { repeat: { weekdays: ["MONDAY"], endDate: "2026-11-30" } }
            : {}),
        }),
      ),
    );
  },
);

it("409 뒤 반복 규칙 재조회가 끝나도 편집값과 오류를 보존해 재시도하고 다른 할 일은 초기화한다", async () => {
  let puts = 0;
  let gets = 0;
  let finishRefresh!: () => void;
  const bodies: unknown[] = [];
  request.mockImplementation(async (input, init) => {
    if (String(input).includes("/repeat")) {
      if (init?.method === "PUT") {
        bodies.push(JSON.parse(String(init.body)));
        return ++puts === 1 ? Response.json({}, { status: 409 }) : Response.json(plannerTask());
      }
      gets++;
      const response = () =>
        Response.json({ seriesId: 4, startDate: null, weekdays: ["MONDAY"], endDate: null });
      if (gets === 2)
        return new Promise<Response>((resolve) => {
          finishRefresh = () => resolve(response());
        });
      return response();
    }
    return Response.json(String(input).includes("/summary?") ? [] : plannerTask());
  });
  const close = vi.fn();
  const view = (key: string) => (
    <QueryClientProvider client={client}>
      <PlannerTaskSheets
        open
        onOpenChange={close}
        userId={7}
        dateKey="2026-11-06"
        todayKey="2026-11-05"
        task={plannerTask({ seriesId: 4, key })}
        subjectId={3}
        subjects={[plannerSubject()]}
        onStudyStart={() => {}}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(view("r:4:2026-11-06"));
  await userEvent.click(screen.getByRole("button", { name: "반복" }));
  await userEvent.click(await screen.findByRole("button", { name: "월" }));
  await userEvent.click(screen.getByRole("button", { name: "화" }));
  await userEvent.click(screen.getByRole("button", { name: "반복 종료일" }));
  await userEvent.click(screen.getByRole("radio", { name: /날짜 정하기/ }));
  await userEvent.click(screen.getByRole("button", { name: /11월 30일/ }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(finishRefresh).toBeDefined());
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByRole("button", { name: "화" })).toHaveAttribute("aria-pressed", "true");
  await act(async () => {
    finishRefresh();
  });
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByRole("button", { name: "월" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "화" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "반복 종료일" })).toHaveTextContent("11월 30일");
  expect(close).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(close).toHaveBeenCalledWith(false));
  expect(bodies).toEqual([
    { weekdays: ["TUESDAY"], endDate: "2026-11-30" },
    { weekdays: ["TUESDAY"], endDate: "2026-11-30" },
  ]);
  rerender(view("r:5:2026-11-06"));
  expect(await screen.findByRole("button", { name: "월" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "화" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "반복 종료일" })).toHaveTextContent("정하지 않음");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
