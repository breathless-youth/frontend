import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PlannerDayResponse } from "@focusmakers/types";
import { Toaster } from "@/components/ui/sonner";
import { mockDeviceTimeZone } from "@/test/deviceTimeZone";
import { plannerDay, plannerSubject, plannerTask } from "@/test/plannerFixtures";
import { PlannerWeek } from "../PlannerWeek";
import { usePlannerWeek } from "../usePlannerWeek";
import { plannerKeys } from "@/lib/plannerQueries";
import * as toastModule from "@/lib/toast";

let client: QueryClient;
let days: Record<string, PlannerDayResponse>;
let requests: { url: string; method: string; body: unknown }[];
let rejectMove: boolean;
let rejectCode: string;
let moveGate: Promise<void>;
let globalSubjects: {
  id: number;
  name: string;
  colorIndex: number;
  studySec: number;
  focusSec: number;
  tasks: never[];
}[];
class Pointer extends MouseEvent {
  pointerId = 1;
  isPrimary = true;
  pointerType = "touch";
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T12:00:00+09:00"));
  vi.stubGlobal("PointerEvent", Pointer);
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => null });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  requests = [];
  days = {};
  rejectMove = false;
  rejectCode = "TASK_LIMIT_EXCEEDED";
  moveGate = Promise.resolve();
  globalSubjects = [
    { id: 3, name: "수학", colorIndex: 2, studySec: 9999, focusSec: 9999, tasks: [] },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const parsed = new URL(String(url), "http://localhost");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url: String(url), method, body });
      if (parsed.pathname === "/api/subjects") return Response.json(globalSubjects);
      const date = parsed.pathname.match(/^\/api\/planner\/days\/(\d{4}-\d{2}-\d{2})$/)?.[1];
      if (date) return Response.json(days[date] ?? plannerDay({ date }));
      if (method === "PATCH") {
        const key = decodeURIComponent(parsed.pathname.split("/").at(-1)!);
        for (const day of Object.values(days))
          for (const subject of day.subjects) {
            const task = subject.tasks.find((item) => item.key === key);
            if (task) {
              task.done = body.done;
              return Response.json(task);
            }
          }
      }
      if (method === "PUT" && parsed.pathname.endsWith("/date")) {
        await moveGate;
        if (rejectMove)
          return Response.json({ message: "date limit", code: rejectCode }, { status: 409 });
        const key = decodeURIComponent(parsed.pathname.split("/").at(-2)!);
        for (const day of Object.values(days))
          for (const subject of day.subjects) {
            const task = subject.tasks.find((item) => item.key === key);
            if (task) {
              subject.tasks = subject.tasks.filter((item) => item.key !== key);
              const target = days[body.date] ?? plannerDay({ date: body.date });
              target.subjects = [plannerSubject({ tasks: [{ ...task, date: body.date }] })];
              days[body.date] = target;
              return Response.json({ ...task, date: body.date });
            }
          }
      }
      if (method === "POST" && parsed.pathname === "/api/planner/tasks") {
        const task = plannerTask({ ...body, key: "new-task" });
        days[body.date] = plannerDay({
          date: body.date,
          subjects: [plannerSubject({ tasks: [task] })],
        });
        return Response.json(task, { status: 201 });
      }
      return Response.json({}, { status: 404 });
    }),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function mount(dateKey = "2026-11-05") {
  const change = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <PlannerWeek userId={7} dateKey={dateKey} onDateChange={change} onStudyStart={() => {}} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { ...view, change };
}
function dateRow(date: string) {
  return screen.getByRole("button", { name: new RegExp(`^11월 ${date}일`) });
}
function dayRegion(date: string) {
  return screen.getByRole("region", {
    name: `11월 ${date}일 ${date === "4" ? "수" : date === "5" ? "목" : "금"}`,
  });
}
async function drag(taskName: string, destination: HTMLElement) {
  const task = screen.getByRole("button", { name: taskName });
  vi.spyOn(document, "elementFromPoint").mockReturnValue(destination);
  fireEvent.pointerDown(task, { clientX: 40, clientY: 120 });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 520));
  });
  fireEvent.pointerMove(task, { clientX: 180, clientY: 220 });
  fireEvent.pointerUp(task, { clientX: 180, clientY: 220 });
}

async function holdTask(name = "손을 따라 움직일 할 일") {
  days["2026-11-05"] = plannerDay({
    date: "2026-11-05",
    subjects: [
      plannerSubject({ tasks: [plannerTask({ key: "drag:task", date: "2026-11-05", name })] }),
    ],
  });
  const view = mount();
  const task = await screen.findByRole("button", { name });
  const row = task.closest("li")!;
  const handle = task.parentElement!;
  vi.spyOn(row, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 100, 320, 30));
  const capture = vi.fn();
  const release = vi.fn();
  Object.defineProperties(handle, {
    setPointerCapture: { configurable: true, value: capture },
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: release },
  });
  fireEvent.pointerDown(task, { clientX: 40, clientY: 120 });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 520));
  });
  return { ...view, task, row, handle, capture, release };
}

it("길게 잡으면 원본 자리를 남긴 프리뷰가 클리핑 밖에서 뜨고 잡은 위치를 유지하며 손을 따라간다", async () => {
  const { task, row, change } = await holdTask();
  const preview = screen.getByTestId("planner-week-drag-preview");
  expect(preview.parentElement).toBe(document.body);
  expect(preview).toHaveAttribute("aria-hidden", "true");
  expect(preview).toHaveClass("pointer-events-none", "fixed", "transition-none");
  expect(preview).toHaveStyle({ left: "20px", top: "100px", width: "320px" });
  expect(preview).toHaveStyle({ transform: "translate3d(0px, 0px, 0)" });
  expect(row).toHaveClass("opacity-35");
  expect(screen.getAllByRole("button", { name: "손을 따라 움직일 할 일" })).toHaveLength(1);
  vi.spyOn(document, "elementFromPoint").mockReturnValue(dateRow("6"));
  fireEvent.pointerMove(task, { clientX: 180, clientY: 220 });
  expect(preview).toHaveStyle({ transform: "translate3d(140px, 100px, 0)" });
  fireEvent.pointerMove(task, { clientX: 0, clientY: 0 });
  expect(preview).toHaveStyle({ transform: "translate3d(-40px, -120px, 0)" });
  fireEvent.pointerUp(task, { clientX: 0, clientY: 0 });
  expect(screen.queryByTestId("planner-week-drag-preview")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(requests.filter((request) => request.method === "PUT")).toHaveLength(1),
  );
  expect(change).not.toHaveBeenCalled();
});

it("자식 버튼의 capture가 부모로 인계될 때 버블링한 lostcapture는 끌기를 취소하지 않는다", async () => {
  const { task, row, handle, release, change } = await holdTask();
  fireEvent(task, new Pointer("lostpointercapture", { bubbles: true }));
  expect(screen.getByTestId("planner-week-drag-preview")).toBeInTheDocument();
  expect(row).toHaveClass("opacity-35");
  expect(release).not.toHaveBeenCalled();
  vi.spyOn(document, "elementFromPoint").mockReturnValue(dateRow("6"));
  fireEvent.pointerMove(handle, { clientX: 180, clientY: 220 });
  expect(screen.getByTestId("planner-week-drag-preview")).toHaveStyle({
    transform: "translate3d(140px, 100px, 0)",
  });
  expect(dateRow("6").closest("[data-week-date]")).toHaveClass("bg-brand-subtle");
  const heldTouch = new Event("touchmove", { bubbles: true, cancelable: true });
  fireEvent(handle, heldTouch);
  expect(heldTouch.defaultPrevented).toBe(true);
  fireEvent.pointerUp(handle, { clientX: 180, clientY: 220 });
  expect(screen.queryByTestId("planner-week-drag-preview")).not.toBeInTheDocument();
  const releasedTouch = new Event("touchmove", { bubbles: true, cancelable: true });
  fireEvent(handle, releasedTouch);
  expect(releasedTouch.defaultPrevented).toBe(false);
  await waitFor(() =>
    expect(requests.filter((request) => request.method === "PUT")).toEqual([
      {
        url: "/api/planner/tasks/drag%3Atask/date?timeZone=Asia%2FSeoul",
        method: "PUT",
        body: { date: "2026-11-06" },
      },
    ]),
  );
  expect(change).not.toHaveBeenCalled();
});

it("이동 가능한 다른 날짜만 강조하고 과거에 놓으면 저장 없이 안내한다", async () => {
  const { task } = await holdTask();
  const hit = vi.spyOn(document, "elementFromPoint");
  hit.mockReturnValue(dateRow("6"));
  fireEvent.pointerMove(task, { clientX: 180, clientY: 220 });
  expect(dateRow("6").closest("[data-week-date]")).toHaveClass("bg-brand-subtle");
  expect(screen.getByRole("status")).toHaveTextContent("옮길 날짜에 놓아 주세요");
  hit.mockReturnValue(dateRow("5"));
  fireEvent.pointerMove(task, { clientX: 160, clientY: 180 });
  expect(dateRow("5").closest("[data-week-date]")).not.toHaveClass("bg-brand-subtle");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  hit.mockReturnValue(dateRow("4"));
  fireEvent.pointerMove(task, { clientX: 100, clientY: 140 });
  expect(dateRow("4").closest("[data-week-date]")).not.toHaveClass("bg-brand-subtle");
  fireEvent.pointerUp(task, { clientX: 100, clientY: 140 });
  expect(screen.queryByTestId("planner-week-drag-preview")).not.toBeInTheDocument();
  expect(await screen.findByText("오늘 이후의 날짜로 옮길 수 있어요")).toBeInTheDocument();
  expect(requests.filter((request) => request.method === "PUT")).toEqual([]);
});

it.each(["pointercancel", "lostpointercapture", "Escape", "blur", "visibilitychange"])(
  "%s로 끌기를 취소하면 프리뷰·강조·스크롤 차단을 없애고 저장·탭·주 이동을 막는다",
  async (reason) => {
    const { task, row, handle, release, change } = await holdTask();
    vi.spyOn(document, "elementFromPoint").mockReturnValue(dateRow("6"));
    fireEvent.pointerMove(task, { clientX: 180, clientY: 121 });
    const heldTouch = new Event("touchmove", { bubbles: true, cancelable: true });
    fireEvent(task, heldTouch);
    expect(heldTouch.defaultPrevented).toBe(true);
    if (reason === "Escape") fireEvent.keyDown(document, { key: "Escape" });
    else if (reason === "blur") fireEvent.blur(window);
    else if (reason === "visibilitychange") {
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      fireEvent(document, new Event("visibilitychange"));
    } else fireEvent(handle, new Pointer(reason, { bubbles: true }));
    expect(screen.queryByTestId("planner-week-drag-preview")).not.toBeInTheDocument();
    expect(row).not.toHaveClass("opacity-35");
    expect(dateRow("6").closest("[data-week-date]")).not.toHaveClass("bg-brand-subtle");
    const releasedTouch = new Event("touchmove", { bubbles: true, cancelable: true });
    fireEvent(task, releasedTouch);
    expect(releasedTouch.defaultPrevented).toBe(false);
    expect(release).toHaveBeenCalledWith(1);
    fireEvent.pointerUp(task, { clientX: 180, clientY: 121 });
    fireEvent.click(task);
    await act(async () => {
      await import("../PlannerTaskSheets");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(requests.filter((request) => request.method === "PUT")).toEqual([]);
    expect(change).not.toHaveBeenCalled();
  },
);

it("움직이지 않고 놓거나 화면을 떠나도 프리뷰와 캡처를 정리한다", async () => {
  const { task, unmount, release } = await holdTask();
  expect(screen.getByTestId("planner-week-drag-preview")).toBeInTheDocument();
  fireEvent.pointerUp(task, { clientX: 40, clientY: 120 });
  fireEvent.click(task);
  await act(async () => {
    await import("../PlannerTaskSheets");
  });
  expect(screen.queryByTestId("planner-week-drag-preview")).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(release).toHaveBeenCalledTimes(1);
  fireEvent.pointerDown(task, { clientX: 40, clientY: 120 });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 520));
  });
  expect(screen.getByTestId("planner-week-drag-preview")).toBeInTheDocument();
  unmount();
  expect(screen.queryByTestId("planner-week-drag-preview")).not.toBeInTheDocument();
  expect(release).toHaveBeenCalledTimes(2);
  expect(requests.filter((request) => request.method === "PUT")).toEqual([]);
});

it("동작 줄이기에서도 손 위치는 따라가고 장식적인 들어올림과 전환은 제한한다", async () => {
  const { task, row } = await holdTask();
  const preview = screen.getByTestId("planner-week-drag-preview");
  expect(preview).toHaveClass("transition-none");
  expect(preview.firstElementChild).toHaveClass("motion-safe:-translate-y-1");
  expect(row).toHaveClass("motion-reduce:transition-none");
  expect(dateRow("6").closest("[data-week-date]")).toHaveClass("motion-reduce:transition-none");
  fireEvent.pointerMove(task, { clientX: 75, clientY: 180 });
  expect(preview).toHaveStyle({ transform: "translate3d(35px, 60px, 0)" });
  fireEvent.pointerCancel(task);
});

it("월요일 시작 7일을 개인 플래너로 조회하고 주간 순공을 일간 응답 합계의 분 올림으로 표시한다", async () => {
  days["2026-11-04"] = plannerDay({ date: "2026-11-04", focusSec: 61 });
  days["2026-11-05"] = plannerDay({ date: "2026-11-05", focusSec: 60 });
  mount();
  expect(await screen.findByRole("heading", { name: "11월 2일 – 8일" })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText("이번 주 순공시간")).toHaveTextContent("3분"));
  expect(
    requests
      .filter((request) => request.url.startsWith("/api/planner/"))
      .map((request) => request.url)
      .sort(),
  ).toEqual(
    [2, 3, 4, 5, 6, 7, 8].map((n) => `/api/planner/days/2026-11-0${n}?timeZone=Asia%2FSeoul`),
  );
  expect(dateRow("5")).toHaveAttribute("aria-current", "date");
  expect(dateRow("5")).toHaveAttribute("aria-expanded", "true");
  expect(dateRow("6")).toHaveAttribute("aria-expanded", "true");
  await userEvent.click(dateRow("4"));
  expect(dateRow("4")).toHaveAttribute("aria-expanded", "true");
  expect(dateRow("5")).toHaveAttribute("aria-expanded", "true");
  await userEvent.click(dateRow("5"));
  expect(dateRow("5")).toHaveAttribute("aria-expanded", "false");
  expect(dateRow("6")).toHaveAttribute("aria-expanded", "true");
});

it("다음·이전 주 버튼과 가로 스와이프는 7일씩 날짜를 이동한다", async () => {
  const { change } = mount("2026-12-31");
  await screen.findByRole("heading", { name: "12월 28일 – 1월 3일" });
  await userEvent.click(screen.getByRole("button", { name: "다음 주" }));
  expect(change).toHaveBeenLastCalledWith("2027-01-07", "button");
  await userEvent.click(screen.getByRole("button", { name: "지난주" }));
  expect(change).toHaveBeenLastCalledWith("2026-12-24", "button");
  const area = screen.getByTestId("planner-week-swipe");
  fireEvent.pointerDown(area, { clientX: 200, clientY: 30 });
  fireEvent.pointerUp(area, { clientX: 40, clientY: 31 });
  expect(change).toHaveBeenLastCalledWith("2027-01-07", "swipe");
});

it("과거 완료를 늦게 체크하고 미래 체크는 안내만 보이며 과거에는 추가를 제공하지 않는다", async () => {
  days["2026-11-04"] = plannerDay({
    date: "2026-11-04",
    subjects: [
      plannerSubject({
        tasks: [plannerTask({ key: "past:key", date: "2026-11-04", name: "지난 할 일" })],
      }),
    ],
  });
  days["2026-11-06"] = plannerDay({
    date: "2026-11-06",
    subjects: [plannerSubject({ tasks: [plannerTask({ name: "미래 할 일" })] })],
  });
  mount();
  await screen.findByText("할 일 1개");
  await userEvent.click(dateRow("4"));
  expect(
    within(dayRegion("4")).queryByRole("button", { name: /할 일 추가/ }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("checkbox", { name: "지난 할 일" }));
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "지난 할 일" })).toBeChecked());
  expect(dateRow("4")).toHaveTextContent("할 일 1/1");
  await userEvent.click(screen.getByRole("checkbox", { name: "미래 할 일" }));
  expect(await screen.findByText("아직 할 일을 완료할 수 없어요")).toBeInTheDocument();
  expect(requests.filter((request) => request.method === "PATCH")).toEqual([
    {
      url: "/api/planner/tasks/past%3Akey?timeZone=Asia%2FSeoul",
      method: "PATCH",
      body: { done: true },
    },
  ]);
});

it("미래 주의 빈 날짜에서도 전체 내 과목을 골라 해당 날짜에 할 일을 추가한다", async () => {
  mount("2026-11-12");
  await screen.findByRole("heading", { name: "11월 9일 – 15일" });
  await userEvent.click(await screen.findByRole("button", { name: /^11월 12일/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: /할 일 추가/ })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: /할 일 추가/ }));
  await userEvent.click(await screen.findByRole("button", { name: "수학" }, { timeout: 5000 }));
  await userEvent.type(screen.getByRole("textbox", { name: "할 일 이름" }), "다음 주 문제 풀기");
  await userEvent.click(screen.getByRole("button", { name: "추가" }));
  await screen.findByRole("checkbox", { name: "다음 주 문제 풀기" });
  expect(requests.find((request) => request.method === "POST")?.body).toEqual({
    subjectId: 3,
    date: "2026-11-12",
    name: "다음 주 문제 풀기",
  });
});

it("길게 끌어 같은 주의 미래 날짜로 이동하며 opaque key를 그대로 보내고 주 스와이프를 막는다", async () => {
  const name = "긴 이름의 가상 반복 할 일을 끝까지 읽을 수 있어요";
  days["2026-11-05"] = plannerDay({
    date: "2026-11-05",
    subjects: [
      plannerSubject({
        tasks: [
          plannerTask({
            key: "r:opaque/4:2026-11-04",
            taskId: null,
            date: "2026-11-05",
            name,
            seriesId: 4,
          }),
        ],
      }),
    ],
  });
  const { change } = mount();
  await screen.findByRole("button", { name });
  await drag(name, dateRow("6"));
  await waitFor(() =>
    expect(within(dayRegion("6")).getByRole("checkbox", { name })).toBeInTheDocument(),
  );
  expect(within(dayRegion("5")).queryByRole("checkbox", { name })).not.toBeInTheDocument();
  expect(requests.find((request) => request.method === "PUT")).toEqual({
    url: "/api/planner/tasks/r%3Aopaque%2F4%3A2026-11-04/date?timeZone=Asia%2FSeoul",
    method: "PUT",
    body: { date: "2026-11-06" },
  });
  expect(change).not.toHaveBeenCalled();
});

it("미래 할 일 오른쪽 끌기 표시를 길게 눌러 다른 날짜로 옮긴다", async () => {
  const name = "끌기 표시로 옮길 계획";
  days["2026-11-06"] = plannerDay({
    date: "2026-11-06",
    subjects: [
      plannerSubject({ tasks: [plannerTask({ key: "future:grip", date: "2026-11-06", name })] }),
    ],
  });
  const { change } = mount();
  const handle = await screen.findByRole("checkbox", { name });
  const toast = vi.spyOn(toastModule, "showToast");
  vi.spyOn(document, "elementFromPoint").mockReturnValue(dateRow("7"));
  fireEvent.pointerDown(handle, { clientX: 350, clientY: 220 });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 520));
  });
  fireEvent.pointerMove(handle, { clientX: 350, clientY: 300 });
  fireEvent.pointerUp(handle, { clientX: 350, clientY: 300 });
  fireEvent.click(handle);
  await waitFor(() =>
    expect(requests.find((request) => request.method === "PUT")).toEqual({
      url: "/api/planner/tasks/future%3Agrip/date?timeZone=Asia%2FSeoul",
      method: "PUT",
      body: { date: "2026-11-07" },
    }),
  );
  expect(
    await within(screen.getByRole("region", { name: "11월 7일 토" })).findByRole("checkbox", {
      name,
    }),
  ).toBeInTheDocument();
  expect(toast).not.toHaveBeenCalledWith("아직 할 일을 완료할 수 없어요");
  expect(change).not.toHaveBeenCalled();
});

it("이동 충돌이면 미리보기를 원래 날짜로 되돌리고 다시 시도할 수 있게 안내한다", async () => {
  rejectMove = true;
  days["2026-11-05"] = plannerDay({
    date: "2026-11-05",
    subjects: [
      plannerSubject({ tasks: [plannerTask({ date: "2026-11-05", name: "옮길 할 일" })] }),
    ],
  });
  mount();
  await screen.findByRole("button", { name: "옮길 할 일" });
  await drag("옮길 할 일", dateRow("6"));
  expect(
    await screen.findByText("할 일을 옮기지 못했어요. 다시 시도해 주세요"),
  ).toBeInTheDocument();
  expect(within(dayRegion("5")).getByRole("checkbox", { name: "옮길 할 일" })).toBeInTheDocument();
  expect(
    within(dayRegion("6")).queryByRole("checkbox", { name: "옮길 할 일" }),
  ).not.toBeInTheDocument();
});

it("옮길 날짜에 같은 반복 할 일이 있으면 그 이유를 토스트로 알린다", async () => {
  rejectMove = true;
  rejectCode = "PLANNER_DUPLICATE_OCCURRENCE";
  days["2026-11-05"] = plannerDay({
    date: "2026-11-05",
    subjects: [
      plannerSubject({ tasks: [plannerTask({ date: "2026-11-05", name: "옮길 할 일" })] }),
    ],
  });
  mount();
  await screen.findByRole("button", { name: "옮길 할 일" });
  await drag("옮길 할 일", dateRow("6"));
  expect(await screen.findByText("그 날짜에 같은 반복 할 일이 이미 있어요")).toBeInTheDocument();
  expect(screen.queryByText("할 일을 옮기지 못했어요. 다시 시도해 주세요")).not.toBeInTheDocument();
});

it("일반 탭으로 기존 할 일 시트를 열어 다른 주로 옮기기를 제공한다", async () => {
  days["2026-11-05"] = plannerDay({
    date: "2026-11-05",
    subjects: [plannerSubject({ tasks: [plannerTask({ date: "2026-11-05", name: "시트 열기" })] })],
  });
  mount();
  await userEvent.click(await screen.findByRole("button", { name: "시트 열기" }));
  expect(await screen.findByRole("button", { name: "다른 날로 옮기기" })).toBeInTheDocument();
});

it("05시 경계와 IANA 시간대 변경을 주간 권한과 조회에 함께 반영한다", async () => {
  vi.setSystemTime(new Date("2026-11-06T04:59:00+09:00"));
  mount();
  await waitFor(() => expect(dateRow("5")).toHaveAttribute("aria-current", "date"));
  const count = requests.length;
  vi.setSystemTime(new Date("2026-11-06T05:00:00+09:00"));
  fireEvent(document, new Event("visibilitychange"));
  await waitFor(() => expect(dateRow("6")).toHaveAttribute("aria-current", "date"));
  await waitFor(() => expect(requests.length).toBeGreaterThan(count));
  mockDeviceTimeZone("America/New_York");
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(dateRow("5")).toHaveAttribute("aria-current", "date"));
  await waitFor(() =>
    expect(
      requests.filter((request) => request.url.includes("timeZone=America%2FNew_York")),
    ).toHaveLength(7),
  );
});

it("계정이 바뀌면 이전 계정에서 저장 중인 이동 미리보기를 새 계정에 적용하지 않는다", async () => {
  let releaseMove!: () => void;
  moveGate = new Promise((resolve) => {
    releaseMove = resolve;
  });
  for (const owner of [7, 8])
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      const date = `2026-11-0${n}`;
      client.setQueryData(
        plannerKeys.day(owner, date, "Asia/Seoul"),
        plannerDay({
          date,
          subjects:
            n === 5
              ? [
                  plannerSubject({
                    tasks: [
                      plannerTask({
                        date,
                        key: "same-key",
                        name: owner === 7 ? "이전 계정 할 일" : "새 계정 할 일",
                      }),
                    ],
                  }),
                ]
              : [],
        }),
      );
    }
  days["2026-11-05"] = plannerDay({
    date: "2026-11-05",
    subjects: [plannerSubject({ tasks: [plannerTask({ date: "2026-11-05", key: "same-key" })] })],
  });
  const { result, rerender } = renderHook(({ owner }) => usePlannerWeek(owner, "2026-11-05"), {
    initialProps: { owner: 7 },
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  let saving!: Promise<void>;
  act(() => {
    saving = result.current.moveTask("same-key", "2026-11-06");
  });
  await waitFor(() =>
    expect(result.current.days.find((day) => day.date === "2026-11-06")?.taskCount).toBe(1),
  );
  rerender({ owner: 8 });
  expect(
    result.current.days.find((day) => day.date === "2026-11-05")?.subjects[0]?.tasks[0]?.name,
  ).toBe("새 계정 할 일");
  await act(async () => {
    releaseMove();
    await saving;
  });
});
