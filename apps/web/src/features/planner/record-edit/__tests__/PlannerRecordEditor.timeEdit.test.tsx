import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
import { PlannerRecordEditor } from "../PlannerRecordEditor";
import type { PlannerRecordView } from "@focusmakers/types";

const start = "2026-11-08T17:47:00Z",
  end = "2026-11-08T17:48:07Z";
const record = () =>
  plannerRecord({
    key: "c:2026-11-08T17:47:00Z",
    source: "MEASURED",
    revision: 0,
    startedAt: start,
    endedAt: end,
    fullStartedAt: start,
    fullEndedAt: end,
    studySec: 67,
    focusSec: 67,
    subjectSegments: [],
    pieces: [{ startedAt: start, endedAt: end, subjectId: null }],
  });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-08T19:16:00Z"));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function mount(
  value: PlannerRecordView = record(),
  onReload?: () => Promise<ReturnType<typeof plannerDay>>,
) {
  const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({
      results: body.operations.map((o: { operationId: string }) => ({
        operationId: o.operationId,
        success: true,
        key: value.key,
        revision: 1,
        status: 200,
        code: null,
        message: null,
      })),
    });
  });
  vi.stubGlobal("fetch", request);
  const close = vi.fn();
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({ date: "2026-11-08", records: [value], subjects: [] })}
        subjects={[{ id: 3, name: "수학", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] }]}
        onClose={close}
        onSaved={async () => {}}
        onReload={onReload}
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByLabelText("기록 편집 격자").querySelector("[data-record]")!);
  return { request, close };
}
function begin() {
  fireEvent.click(screen.getByRole("button", { name: "기록 시간 수정" }));
}
it("67초 기록의 실제 시간을 늘리면 길이가 바뀌고 적용·저장 시 revision UPDATE를 전송한다", async () => {
  const { request, close } = mount();
  begin();
  fireEvent.change(screen.getByLabelText("시작"), { target: { value: "18:33" } });
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "02:49" } });
  expect(screen.getByRole("region", { name: "선택한 기록" })).toHaveTextContent("8시간 15분 7초");
  fireEvent.click(screen.getByRole("button", { name: "시간 적용" }));
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(request.mock.calls[0]![1]?.body)).operations).toEqual([
    {
      operationId: expect.any(String),
      action: "UPDATE",
      key: record().key,
      revision: 0,
      startedAt: "2026-11-08T09:33:00.000Z",
      endedAt: end,
      subjectId: null,
      timeZone: "Asia/Seoul",
    },
  ]);
  expect(close).toHaveBeenCalledOnce();
});
it("삭제 빈칸이 있는 단일 과목은 시간을 늘려도 빈칸을 칠하지 않고 실제 길이를 표시한다", async () => {
  const s = "2026-11-08T00:00:00Z",
    e = "2026-11-08T00:03:00Z";
  const value = plannerRecord({
    key: "c:gap",
    revision: 0,
    startedAt: s,
    endedAt: e,
    fullStartedAt: s,
    fullEndedAt: e,
    studySec: 120,
    focusSec: 120,
    subjectSegments: [],
    pieces: [
      { startedAt: s, endedAt: "2026-11-08T00:01:00Z", subjectId: 3 },
      { startedAt: "2026-11-08T00:02:00Z", endedAt: e, subjectId: 3 },
    ],
  });
  const { request } = mount(value);
  begin();
  expect(screen.getByRole("region", { name: "선택한 기록" })).toHaveTextContent("2분");
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "09:05" } });
  expect(screen.getByRole("region", { name: "선택한 기록" })).toHaveTextContent("4분");
  const shapes = [
    ...screen.getByLabelText("기록 편집 격자").querySelectorAll<HTMLElement>("[data-record]"),
  ];
  expect(
    shapes.some(
      (b) =>
        Number(b.dataset.start) < Date.parse("2026-11-08T00:02:00Z") &&
        Number(b.dataset.end) > Date.parse("2026-11-08T00:01:00Z"),
    ),
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "시간 적용" }));
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(request).toHaveBeenCalledOnce());
  expect(JSON.parse(String(request.mock.calls[0]![1]?.body)).operations[0]).toMatchObject({
    action: "UPDATE",
    revision: 0,
    subjectId: 3,
  });
});
it.each([false, true])(
  "부모 전체에 서로 다른 과목이 있으면 시간 수정으로 덮어쓰지 않는다 (null포함:%s)",
  (withNull) => {
    const value = record();
    value.pieces = [
      { startedAt: start, endedAt: "2026-11-08T17:48:00Z", subjectId: 3 },
      { startedAt: "2026-11-08T17:48:00Z", endedAt: end, subjectId: withNull ? null : 4 },
    ];
    mount(value);
    expect(screen.getByRole("button", { name: "기록 시간 수정" })).toBeDisabled();
  },
);
it.each(["MEASURED", "MANUAL"] as const)(
  "조회 날짜 밖의 과목을 모르는 %s 부모는 시간 수정을 보호한다",
  (source) => {
    const value = record();
    value.source = source;
    value.fullStartedAt = "2026-11-07T19:59:00Z";
    mount(value);
    expect(screen.getByRole("button", { name: "기록 시간 수정" })).toBeDisabled();
  },
);
it("같은 부모의 미저장 분 편집과 시간 UPDATE를 섞지 않는다", async () => {
  const { request } = mount();
  fireEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "수학" }));
  expect(screen.getByRole("button", { name: "기록 시간 수정" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(request).toHaveBeenCalledOnce());
  expect(JSON.parse(String(request.mock.calls[0]![1]?.body)).operations[0].action).toBe(
    "EDIT_RANGES",
  );
});
it("시간 변경 후 같은 부모를 다시 눌러도 분 편집과 섞이지 않는다", () => {
  mount();
  begin();
  fireEvent.change(screen.getByLabelText("시작"), { target: { value: "02:40" } });
  fireEvent.click(screen.getByRole("button", { name: "시간 적용" }));
  fireEvent.click(screen.getByLabelText("기록 편집 격자").querySelector("[data-record]")!);
  expect(screen.getByRole("button", { name: "시간 적용" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "과목 바꾸기" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "기록 삭제" })).not.toBeInTheDocument();
});

it("시작의 소수초를 손대지 않은 시간 수정은 미리보기·UPDATE 모두 원본 초를 보존한다", async () => {
  const value = record();
  value.startedAt = value.fullStartedAt = "2026-11-08T17:47:30.250Z";
  value.endedAt = value.fullEndedAt = "2026-11-08T17:48:37.750Z";
  value.pieces = [{ startedAt: value.startedAt, endedAt: value.endedAt, subjectId: null }];
  const { request } = mount(value);
  begin();
  expect(screen.getByRole("region", { name: "선택한 기록" })).toHaveTextContent("1분 8초");
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "03:00" } });
  expect(screen.getByRole("region", { name: "선택한 기록" })).toHaveTextContent("12분 30초");
  fireEvent.click(screen.getByRole("button", { name: "시간 적용" }));
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(request).toHaveBeenCalledOnce());
  expect(JSON.parse(String(request.mock.calls[0]![1]?.body)).operations[0]).toMatchObject({
    action: "UPDATE",
    startedAt: value.startedAt,
    endedAt: "2026-11-08T18:00:00.000Z",
  });
});

it.each(["invalid", "2026-11-08T17:47:30Z"])(
  "잘못된 전체 경계%s는 표시를 깨뜨리지 않고 시간 수정을 막는다",
  (bad) => {
    const value = record();
    value.fullStartedAt = bad;
    expect(() => mount(value)).not.toThrow();
    expect(screen.getByRole("button", { name: "기록 시간 수정" })).toBeDisabled();
    expect(screen.getByRole("region", { name: "선택한 기록" })).toHaveTextContent("1분");
  },
);
