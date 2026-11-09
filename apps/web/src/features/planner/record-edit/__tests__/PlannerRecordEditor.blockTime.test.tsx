import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
import { PlannerRecordEditor } from "../PlannerRecordEditor";
import type { PlannerRecordPiece, PlannerRecordView } from "@focusmakers/types";

const z = (hm: string) => `2026-11-09T${hm}:00.000Z`;
const record = (key: string, pieces: PlannerRecordPiece[]): PlannerRecordView =>
  plannerRecord({
    key,
    source: "MEASURED",
    revision: 2,
    startedAt: pieces[0]!.startedAt,
    endedAt: pieces.at(-1)!.endedAt,
    fullStartedAt: pieces[0]!.startedAt,
    fullEndedAt: pieces.at(-1)!.endedAt,
    studySec: 240,
    focusSec: 240,
    subjectSegments: [],
    pieces,
  });
// 10:00–10:02 국어, 10:02–10:04 수학 (KST)
const mixed = () =>
  record("c:mixed", [
    { startedAt: z("01:00"), endedAt: z("01:02"), subjectId: 3 },
    { startedAt: z("01:02"), endedAt: z("01:04"), subjectId: 4 },
  ]);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T06:11:00Z"));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mount(records: PlannerRecordView[]) {
  const request = vi.fn(async (_url: unknown, init?: RequestInit) =>
    Response.json({
      results: JSON.parse(String(init?.body)).operations.map(
        (o: { operationId: string; key: string }) => ({
          operationId: o.operationId,
          success: true,
          key: o.key,
          revision: 3,
          status: 200,
          code: null,
          message: null,
        }),
      ),
    }),
  );
  vi.stubGlobal("fetch", request);
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({ date: "2026-11-09", records, subjects: [] })}
        subjects={[
          { id: 3, name: "국어", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] },
          { id: 4, name: "수학", colorIndex: 1, studySec: 0, focusSec: 0, tasks: [] },
        ]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  return request;
}
const panel = () => screen.getByRole("region", { name: "선택한 기록" });
function tapBlock(startIso: string) {
  const shape = [
    ...screen.getByLabelText("기록 편집 격자").querySelectorAll<HTMLElement>("[data-record]"),
  ].find((b) => Number(b.dataset.start) === Date.parse(startIso))!;
  fireEvent.click(shape);
}
async function save(request: ReturnType<typeof mount>) {
  fireEvent.click(screen.getByRole("button", { name: "완료" }));
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  return JSON.parse(String(request.mock.calls[0]![1]?.body)).operations;
}

it("4초 기록의 시작을 앞으로 늘리면 길이가 늘고 저장 시 ADD 한 번을 보낸다", async () => {
  const request = mount([
    record("c:short", [
      { startedAt: z("04:43"), endedAt: "2026-11-09T04:43:04.000Z", subjectId: 3 },
    ]),
  ]);
  tapBlock(z("04:43"));
  fireEvent.change(screen.getByLabelText("시작"), { target: { value: "09:00" } });
  expect(panel()).toHaveTextContent("09:00 – 13:44");
  expect(panel()).toHaveTextContent("4시간 43분 4초");
  expect(await save(request)).toEqual([
    expect.objectContaining({
      action: "EDIT_RANGES",
      key: "c:short",
      revision: 2,
      ranges: [{ startedAt: z("00:00"), endedAt: z("04:43"), change: "ADD", subjectId: 3 }],
    }),
  ]);
});

it("과목 블록을 누르면 같은 과목이 이어진 블록 전체가 선택되고 모드 줄이 없다", () => {
  mount([mixed()]);
  tapBlock(z("01:00"));
  expect(panel()).toHaveTextContent("국어");
  expect(panel()).toHaveTextContent("10:00 – 10:02");
  expect(screen.queryByRole("button", { name: "기록 시간 수정" })).toBeNull();
  expect(screen.queryByText("과목·삭제 범위 선택")).toBeNull();
});

it("옆 과목 블록 쪽으로 늘리면 멈추고 겹침 안내를 보여준다", () => {
  mount([mixed()]);
  tapBlock(z("01:00"));
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "10:03" } });
  expect(panel()).toHaveTextContent("10:00 – 10:02");
  expect(screen.getAllByText("다른 기록과 겹치지 않게 골라 주세요").length).toBeGreaterThan(0);
});

it("다른 기록 쪽으로 늘려도 멈춘다", () => {
  mount([
    mixed(),
    record("c:other", [{ startedAt: z("01:05"), endedAt: z("01:07"), subjectId: 3 }]),
  ]);
  tapBlock(z("01:02"));
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "10:06" } });
  expect(panel()).toHaveTextContent("10:02 – 10:04");
});

it("끝을 줄이면 줄인 분만 DELETE로 보내고 다른 과목은 그대로다", async () => {
  const request = mount([mixed()]);
  tapBlock(z("01:02"));
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "10:03" } });
  expect(panel()).toHaveTextContent("10:02 – 10:03");
  expect((await save(request))[0].ranges).toEqual([
    { startedAt: z("01:03"), endedAt: z("01:04"), change: "DELETE" },
  ]);
});

it("빈 쪽으로 끝을 늘리면 그 과목으로 ADD를 보낸다", async () => {
  const request = mount([mixed()]);
  tapBlock(z("01:02"));
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "10:10" } });
  expect(panel()).toHaveTextContent("10:02 – 10:10");
  expect((await save(request))[0].ranges).toEqual([
    { startedAt: z("01:04"), endedAt: z("01:10"), change: "ADD", subjectId: 4 },
  ]);
});
