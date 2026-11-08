import { act, cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
import { PlannerRecordEditor } from "../PlannerRecordEditor";

const record = plannerRecord({
  revision: 0,
  startedAt: "2026-11-06T00:00:00Z",
  endedAt: "2026-11-06T00:02:37Z",
  pieces: [
    { startedAt: "2026-11-06T00:00:00Z", endedAt: "2026-11-06T00:00:20Z", subjectId: 3 },
    { startedAt: "2026-11-06T00:00:20Z", endedAt: "2026-11-06T00:00:40Z", subjectId: 4 },
    { startedAt: "2026-11-06T00:00:40Z", endedAt: "2026-11-06T00:01:00Z", subjectId: 5 },
    { startedAt: "2026-11-06T00:02:00Z", endedAt: "2026-11-06T00:02:37Z", subjectId: 3 },
  ],
});
const subjects = [
  { id: 3, name: "수학", colorIndex: 2, studySec: 0, focusSec: 0, tasks: [] },
  { id: 4, name: "영어", colorIndex: 1, studySec: 0, focusSec: 0, tasks: [] },
  { id: 5, name: "국어", colorIndex: 3, studySec: 0, focusSec: 0, tasks: [] },
];
const day = plannerDay({ records: [record] });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("기존 분을 선택한 채 빈칸을 길게 끌어도 새 기록만 늘리고 저장한다", async () => {
  class Pointer extends MouseEvent {
    readonly pointerId = 1;
    readonly isPrimary = true;
    readonly pointerType = "touch";
  }
  vi.stubGlobal("PointerEvent", Pointer);
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({
      results: body.operations.map((op: { operationId: string }) => ({
        operationId: op.operationId,
        success: true,
        key: "m:new",
        revision: 0,
        status: 201,
        code: null,
        message: null,
      })),
    });
  });
  vi.stubGlobal("fetch", fetch);
  mount();
  const grid = screen.getByLabelText("기록 편집 격자");
  fireEvent.click(grid.querySelector("[data-record]")!);
  grid.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 600,
    bottom: 768,
    x: 0,
    y: 0,
    width: 600,
    height: 768,
    toJSON() {},
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fireEvent.pointerDown(grid, { clientX: 100, clientY: 168 });
  act(() => vi.advanceTimersByTime(600));
  fireEvent.pointerMove(grid, { clientX: 200, clientY: 168 });
  fireEvent.pointerUp(grid, { clientX: 200, clientY: 168 });
  vi.useRealTimers();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "과목 없음" }));
  expect(screen.getByLabelText("시작")).toHaveValue("10:10");
  expect(screen.getByLabelText("끝")).toHaveValue("10:20");
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).operations).toEqual([
    {
      action: "CREATE",
      operationId: expect.any(String),
      startedAt: "2026-11-06T01:10:00.000Z",
      endedAt: "2026-11-06T01:20:00.000Z",
      subjectId: null,
      timeZone: "Asia/Seoul",
    },
  ]);
});
function mount(props: Partial<React.ComponentProps<typeof PlannerRecordEditor>> = {}) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={day}
        subjects={subjects}
        onSaved={async () => {}}
        onClose={onClose}
        {...props}
      />
    </MemoryRouter>,
  );
  return onClose;
}

it("분 대표 과목을 표시하고 선택한 분의 모든 구간을 EDIT_RANGES로 바꾼다", async () => {
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({
      results: [
        {
          operationId: body.operations[0].operationId,
          key: record.key,
          revision: 1,
          success: true,
          status: 200,
          code: null,
          message: null,
        },
      ],
    });
  });
  vi.stubGlobal("fetch", fetch);
  mount();
  const grid = screen.getByLabelText("기록 편집 격자");
  fireEvent.click(within(grid).getByRole("button", { name: /국어 09:00.*09:01/ }));
  const panel = screen.getByRole("region", { name: "선택한 기록" });
  expect(panel).toHaveTextContent("국어");
  expect(panel).not.toHaveTextContent("수학 · 영어");
  fireEvent.click(within(panel).getByRole("button", { name: "과목 바꾸기" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "영어" }));
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).operations).toEqual([
    {
      operationId: expect.any(String),
      action: "EDIT_RANGES",
      key: record.key,
      revision: 0,
      ranges: [
        {
          startedAt: "2026-11-06T00:00:00.000Z",
          endedAt: "2026-11-06T00:01:00.000Z",
          change: "SUBJECT",
          subjectId: 4,
        },
      ],
    },
  ]);
});

it("37초 분 선택은 실제 길이를 표시하고 삭제 범위도 그 분으로 한정한다", async () => {
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({
      results: [
        {
          operationId: body.operations[0].operationId,
          key: record.key,
          revision: 1,
          success: true,
          status: 200,
          code: null,
          message: null,
        },
      ],
    });
  });
  vi.stubGlobal("fetch", fetch);
  mount();
  fireEvent.click(
    within(screen.getByLabelText("기록 편집 격자")).getByRole("button", {
      name: /수학 09:02.*09:03/,
    }),
  );
  expect(screen.getByRole("region", { name: "선택한 기록" })).toHaveTextContent("37초");
  fireEvent.click(screen.getByRole("button", { name: "기록 삭제" }));
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: /삭제/ }));
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).operations[0]).toMatchObject({
    action: "EDIT_RANGES",
    ranges: [
      {
        startedAt: "2026-11-06T00:02:00.000Z",
        endedAt: "2026-11-06T00:03:00.000Z",
        change: "DELETE",
      },
    ],
  });
});

it("새 계약 없는 기록을 전체 UPDATE·DELETE로 수정하지 않는다", () => {
  mount({ day: plannerDay({ records: [plannerRecord()] }) });
  fireEvent.click(screen.getByLabelText("기록 편집 격자").querySelector("[data-record]")!);
  expect(screen.getByRole("button", { name: "과목 바꾸기" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "기록 삭제" })).toBeDisabled();
  expect(screen.getByLabelText("시작")).toBeDisabled();
  expect(screen.getByRole("button", { name: "완료" })).toBeEnabled();
});

it("stale 재조회 실패 후 다시 시도는 조회만 하고 없어진 선택 분을 닫는다", async () => {
  const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({
      results: [
        {
          operationId: body.operations[0].operationId,
          success: false,
          key: record.key,
          status: 409,
          code: "STALE_RECORD",
          message: null,
        },
      ],
    });
  });
  vi.stubGlobal("fetch", request);
  const reload = vi
    .fn<() => Promise<typeof day>>()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      ...day,
      records: [{ ...record, revision: 2, pieces: [record.pieces![3]!] }],
    });
  const close = mount({ onReload: reload });
  fireEvent.click(screen.getByLabelText("기록 편집 격자").querySelector("[data-record]")!);
  fireEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "영어" }));
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.queryByRole("region", { name: "선택한 기록" })).not.toBeInTheDocument(),
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("범위를 다시 선택");
});

it("긴 동일 과목 영역의 중간을 누르면 UTC 해당 분을 골라 원본 시각 없이 저장한다", async () => {
  const longRecord = {
    ...record,
    pieces: [{ startedAt: "2026-11-06T00:00:00Z", endedAt: "2026-11-06T00:03:00Z", subjectId: 3 }],
  };
  const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({
      results: [
        {
          operationId: body.operations[0].operationId,
          success: true,
          key: record.key,
          revision: 1,
          status: 200,
          code: null,
          message: null,
        },
      ],
    });
  });
  vi.stubGlobal("fetch", request);
  mount({ day: { ...day, records: [longRecord] } });
  const shape = screen
    .getByLabelText("기록 편집 격자")
    .querySelector<HTMLButtonElement>("[data-record]")!;
  shape.getBoundingClientRect = () => ({
    left: 100,
    top: 0,
    right: 400,
    bottom: 32,
    x: 100,
    y: 0,
    width: 300,
    height: 32,
    toJSON() {},
  });
  fireEvent.click(shape, { detail: 1, clientX: 299 });
  expect(screen.getByLabelText("시작")).toHaveValue("09:01");
  expect(screen.getByLabelText("끝")).toHaveValue("09:02");
  fireEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "영어" }));
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body)).operations[0]).toMatchObject({
    action: "EDIT_RANGES",
    ranges: [
      {
        startedAt: "2026-11-06T00:01:00.000Z",
        endedAt: "2026-11-06T00:02:00.000Z",
        change: "SUBJECT",
        subjectId: 4,
      },
    ],
  });
});
