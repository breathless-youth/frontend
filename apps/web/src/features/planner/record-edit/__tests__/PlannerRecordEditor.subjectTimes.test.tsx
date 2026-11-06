import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PlannerRecordEditor } from "../PlannerRecordEditor";
import { plannerDay, plannerRecord, plannerSubject } from "@/test/plannerFixtures";

function mount() {
  const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({
      results: body.operations.map((op: { operationId: string }) => ({
        operationId: op.operationId,
        success: true,
        key: "c:updated",
        status: 200,
        code: null,
        message: null,
      })),
    });
  });
  vi.stubGlobal("fetch", request);
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-11-06",
          subjects: [plannerSubject()],
          records: [
            plannerRecord({
              startedAt: "2026-11-05T20:00:00Z",
              endedAt: "2026-11-05T21:00:00Z",
              fullStartedAt: "2026-11-05T19:30:00Z",
              fullEndedAt: "2026-11-05T21:00:00Z",
              subjectSegments: [
                {
                  subjectId: 3,
                  startedAt: "2026-11-05T20:00:00Z",
                  endedAt: "2026-11-05T21:00:00Z",
                  studySec: 3600,
                  focusSec: 3600,
                },
              ],
            }),
          ],
        })}
        subjects={[{ id: 3, name: "수학", colorIndex: 2, studySec: 0, focusSec: 0, tasks: [] }]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getAllByRole("button", { name: /04:30.*06:00/ })[0]!);
  return request;
}
function chooseSubject() {
  fireEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveTextContent(
    "선택한 과목은 화면에 보이지 않는 시간까지 기록 전체에 적용돼요.",
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "수학" }));
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("경계 기록 시간을 먼저 입력한 뒤 과목을 고르면 보이는 시간까지 함께 저장한다", async () => {
  const request = mount();
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "06:10" } });
  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  chooseSubject();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByLabelText("끝")).toHaveValue("06:10");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(request.mock.calls[0]![1]?.body))).toMatchObject({
    operations: [
      {
        action: "UPDATE",
        subjectId: 3,
        startedAt: "2026-11-05T19:30:00Z",
        endedAt: "2026-11-05T21:10:00.000Z",
      },
    ],
  });
});
it("과목을 고를 때 시각이 불완전하면 오류를 유지하고 상단 저장을 막는다", async () => {
  const request = mount();
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "" } });
  chooseSubject();
  expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(
    "시작과 끝을 다시 확인해 주세요",
  );
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByLabelText("끝")).toHaveValue("");
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(request).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "06:10" } });
  chooseSubject();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(request.mock.calls[0]![1]?.body))).toMatchObject({
    operations: [{ subjectId: 3, endedAt: "2026-11-05T21:10:00.000Z" }],
  });
});
