import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { plannerDay, plannerRangeRecord as plannerRecord } from "@/test/plannerFixtures";
import { PlannerRecordEditor } from "../PlannerRecordEditor";

const request = vi.fn<typeof fetch>();
let client: QueryClient;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T03:00:00Z"));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  request.mockReset();
  vi.stubGlobal("fetch", request);
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderEditor(userId?: number) {
  const onClose = vi.fn();
  const onSaved = vi.fn().mockResolvedValue(undefined);
  const onDateChange = vi.fn();
  function EditorWithDate() {
    const [date, setDate] = useState("2026-11-04");
    return (
      <PlannerRecordEditor
        key={date}
        day={plannerDay({
          date,
          records: [
            plannerRecord({
              key: `c:${date}`,
              startedAt: `${date}T00:13:00Z`,
              endedAt: `${date}T00:${date === "2026-11-04" ? "29" : "45"}:00Z`,
              subjectSegments: [],
            }),
          ],
        })}
        userId={userId}
        subjects={[]}
        onClose={onClose}
        onSaved={onSaved}
        onDateChange={(next) => {
          onDateChange(next);
          setDate(next);
        }}
      />
    );
  }
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EditorWithDate />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onClose, onSaved, onDateChange };
}

async function editRecord() {
  await userEvent.click(screen.getAllByRole("button", { name: /09:13.*09:29/ })[0]!);
  fireEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "과목 없음" }));
  await userEvent.click(screen.getByRole("button", { name: "완료" }));
}

async function pickDate(name: RegExp) {
  await userEvent.click(screen.getByRole("button", { name: "날짜 고르기" }));
  const calendar = screen.getByRole("dialog");
  await userEvent.click(within(calendar).getByRole("button", { name }));
}

it("수정하지 않은 기록 날짜를 고르면 새 날짜의 기록 편집을 이어 간다", async () => {
  request.mockResolvedValue(
    Response.json([
      {
        date: "2026-11-05",
        taskCount: 0,
        completedCount: 0,
        studySec: 3600,
        focusSec: 3000,
        studied: true,
        hasTasks: false,
        goalSec: null,
      },
    ]),
  );
  const { onClose, onSaved, onDateChange } = renderEditor(7);
  await userEvent.click(screen.getByRole("button", { name: "날짜 고르기" }));
  await userEvent.click(await screen.findByRole("button", { name: /11월 5일.*공부한 날/ }));
  expect(onDateChange).toHaveBeenCalledExactlyOnceWith("2026-11-05");
  expect(screen.getByRole("heading", { name: "기록 고치기" })).toBeInTheDocument();
  expect(screen.getByText("11월 5일")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /09:13.*09:45/ })).not.toHaveLength(0);
  expect(screen.queryByRole("button", { name: /09:13.*09:29/ })).not.toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
  expect(request.mock.calls[0]?.[0]).toBe(
    "/api/planner/summary?from=2026-11-01&to=2026-11-30&timeZone=Asia%2FSeoul",
  );
});

it("수정 중 날짜 이동을 취소하면 원래 날짜와 저장하지 않은 기록을 유지한다", async () => {
  const { onClose, onDateChange } = renderEditor();
  await editRecord();
  await pickDate(/11월 5일/);
  const dialog = screen.getByRole("alertdialog", { name: "저장하지 않고 나갈까요?" });
  expect(onDateChange).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole("button", { name: "취소" }));
  expect(screen.getByText("11월 4일")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /09:13.*09:29/ })).not.toHaveLength(0);
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

it("수정 중 날짜 이동을 확인하면 저장 없이 선택한 날짜의 기록으로 바꾼다", async () => {
  const { onClose, onSaved, onDateChange } = renderEditor();
  await editRecord();
  await pickDate(/11월 5일/);
  const dialog = screen.getByRole("alertdialog", { name: "저장하지 않고 나갈까요?" });
  await userEvent.click(within(dialog).getByRole("button", { name: "나가기" }));
  expect(onDateChange).toHaveBeenCalledExactlyOnceWith("2026-11-05");
  expect(screen.getByText("11월 5일")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /09:13.*09:45/ })).not.toHaveLength(0);
  expect(onClose).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

it("수정 중 같은 날짜를 다시 고르면 초안과 날짜를 바꾸거나 이탈을 확인하지 않는다", async () => {
  const { onDateChange } = renderEditor();
  await editRecord();
  await pickDate(/11월 4일/);
  expect(onDateChange).not.toHaveBeenCalled();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /09:13.*09:29/ })).not.toHaveLength(0);
});

it("오늘까지 날짜를 고를 수 있고 미래 기록 날짜는 비활성화한다", async () => {
  const { onDateChange } = renderEditor();
  await userEvent.click(screen.getByRole("button", { name: "날짜 고르기" }));
  const calendar = screen.getByRole("dialog");
  expect(within(calendar).getByRole("button", { name: /11월 5일/ })).toBeEnabled();
  expect(within(calendar).getByRole("button", { name: /11월 6일.*오늘/ })).toBeEnabled();
  const future = within(calendar).getByRole("button", { name: /11월 7일/ });
  expect(future).toBeDisabled();
  await userEvent.click(future);
  expect(onDateChange).not.toHaveBeenCalled();
  await userEvent.click(within(calendar).getByRole("button", { name: /11월 6일.*오늘/ }));
  expect(onDateChange).toHaveBeenCalledExactlyOnceWith("2026-11-06");
});

it("저장 결과를 기다리는 동안 날짜 이동으로 기록 초안을 버릴 수 없다", async () => {
  let finish!: (response: Response) => void;
  request.mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const { onDateChange, onClose } = renderEditor();
  await editRecord();
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  const dateButton = screen.getByRole("button", { name: "날짜 고르기" });
  expect(dateButton).toBeDisabled();
  fireEvent.click(dateButton);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(onDateChange).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => finish(Response.json({ results: [] })));
  expect(await screen.findByRole("button", { name: "다시 시도" })).toBeEnabled();
});

it("저장 결과가 불명확해도 날짜 이동 취소 후 원래 작업으로 다시 시도한다", async () => {
  request.mockResolvedValueOnce(Response.json({ results: [] }));
  const { onDateChange, onClose } = renderEditor();
  await editRecord();
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await screen.findByRole("button", { name: "다시 시도" });
  await pickDate(/11월 5일/);
  const dialog = screen.getByRole("alertdialog", { name: "저장하지 않고 나갈까요?" });
  await userEvent.click(within(dialog).getByRole("button", { name: "취소" }));
  const firstBody = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
  request.mockResolvedValueOnce(
    Response.json({
      results: firstBody.operations.map((operation: { operationId: string }) => ({
        operationId: operation.operationId,
        success: true,
        key: "c:2026-11-04",
        revision: 1,
        status: 200,
        code: null,
        message: null,
      })),
    }),
  );
  await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(onDateChange).not.toHaveBeenCalled();
  expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual(firstBody);
});
