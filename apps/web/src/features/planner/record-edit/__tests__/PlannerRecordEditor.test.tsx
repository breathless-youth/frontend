import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PlannerRecordEditor } from "../PlannerRecordEditor";
import { plannerDay, plannerRecord, plannerSubject } from "@/test/plannerFixtures";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it.each(["입력", "손잡이"])(
  "현재 분에 끝난 원본 기록은 %s 조작 뒤 원본 종료 초를 보존해 저장한다",
  async (method) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T00:29:50Z"));
    class Pointer extends MouseEvent {
      readonly isPrimary = true;
      readonly pointerId = 1;
      readonly pointerType = "touch";
    }
    vi.stubGlobal("PointerEvent", Pointer);
    const requests: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        requests.push(body);
        return Response.json({
          results: body.operations.map((operation: { operationId: string }) => ({
            operationId: operation.operationId,
            success: true,
            key: "c:updated",
            status: 200,
            code: null,
            message: null,
          })),
        });
      }),
    );
    render(
      <MemoryRouter>
        <PlannerRecordEditor
          day={plannerDay({
            date: "2026-11-04",
            records: [
              plannerRecord({
                startedAt: "2026-11-04T00:13:20Z",
                endedAt: "2026-11-04T00:29:40Z",
                subjectSegments: [],
              }),
            ],
          })}
          subjects={[]}
          onClose={() => {}}
          onSaved={async () => {}}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /09:14.*09:30/ })[0]!);
    if (method === "입력") {
      fireEvent.change(screen.getByLabelText("시작"), { target: { value: "09:15" } });
    } else {
      const grid = screen.getByLabelText("기록 편집 격자");
      grid.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 600,
        height: 768,
        right: 600,
        bottom: 768,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      fireEvent.pointerDown(screen.getByRole("button", { name: "시작 시각 조절" }), {
        clientX: 140,
        clientY: 144,
      });
      fireEvent.pointerMove(grid, { clientX: 150, clientY: 144 });
      fireEvent.pointerUp(grid, { clientX: 150, clientY: 144 });
    }
    expect(screen.getByLabelText("시작")).toHaveValue("09:15");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      operations: [
        {
          action: "UPDATE",
          startedAt: "2026-11-04T00:15:00.000Z",
          endedAt: "2026-11-04T00:29:40Z",
        },
      ],
    });
  },
);

it("현재 분이 지나기 전에는 다음 분으로 종료 시각을 늘릴 수 없다", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T00:29:50Z"));
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-11-04",
          records: [
            plannerRecord({
              startedAt: "2026-11-04T00:13:00Z",
              endedAt: "2026-11-04T00:28:00Z",
              subjectSegments: [],
            }),
          ],
        })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getAllByRole("button", { name: /09:13.*09:28/ })[0]!);
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "09:30" } });
  expect(screen.getByRole("alert")).toHaveTextContent("현재 시각 전까지 고칠 수 있어요");
  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
});

it("측정 기록의 1분 수정은 완료가 아니라 상단 저장에서 일괄 전송한다", async () => {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push({ url, body });
      return Response.json({
        results: body.operations.map((operation: { operationId: string }) => ({
          operationId: operation.operationId,
          success: true,
          key: "c:updated",
          status: 200,
          code: null,
          message: null,
        })),
      });
    }),
  );
  const client = new QueryClient();
  const close = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlannerRecordEditor
          day={plannerDay({
            date: "2026-11-04",
            subjects: [plannerSubject()],
            records: [
              plannerRecord({
                startedAt: "2026-11-04T00:13:00Z",
                endedAt: "2026-11-04T00:29:00Z",
                subjectSegments: [
                  {
                    subjectId: 3,
                    startedAt: "2026-11-04T00:13:00Z",
                    endedAt: "2026-11-04T00:29:00Z",
                    studySec: 960,
                    focusSec: 960,
                  },
                ],
              }),
            ],
          })}
          subjects={[{ id: 3, name: "수학", colorIndex: 2, studySec: 0, focusSec: 0, tasks: [] }]}
          onClose={close}
          onSaved={async () => {}}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getAllByRole("button", { name: /09:13.*09:29/ })[0]!);
  const end = screen.getByLabelText("끝");
  await userEvent.clear(end);
  await userEvent.type(end, "09:30");
  await userEvent.click(screen.getByRole("button", { name: "완료" }));
  expect(calls).toEqual([]);
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(calls).toEqual([
    {
      url: "/api/planner/records/batch",
      body: {
        operations: [
          expect.objectContaining({
            action: "UPDATE",
            startedAt: "2026-11-04T00:13:00Z",
            endedAt: "2026-11-04T00:30:00.000Z",
            subjectId: 3,
            timeZone: "Asia/Seoul",
          }),
        ],
      },
    },
  ]);
  client.clear();
});
it("빈 칸을 길게 끌고 과목을 고른 기록은 상단 저장 전까지 초안에만 둔다", async () => {
  class Pointer extends MouseEvent {
    readonly isPrimary = true;
    readonly pointerId = 1;
    readonly pointerType = "touch";
  }
  vi.stubGlobal("PointerEvent", Pointer);
  const calls: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      return Response.json({
        results: body.operations.map((operation: { operationId: string }) => ({
          operationId: operation.operationId,
          success: true,
          key: "m:new",
          status: 201,
          code: null,
          message: null,
        })),
      });
    }),
  );
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({ date: "2026-11-04" })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  const grid = screen.getByLabelText("기록 편집 격자");
  grid.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 600,
    height: 672,
    right: 600,
    bottom: 672,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fireEvent.pointerDown(grid, { clientX: 130, clientY: 122 });
  act(() => vi.advanceTimersByTime(600));
  expect(screen.queryByRole("region", { name: "선택한 기록", hidden: true })).toBeNull();
  fireEvent.pointerMove(grid, { clientX: 290, clientY: 122 });
  fireEvent.pointerUp(grid, { clientX: 290, clientY: 122 });
  vi.useRealTimers();
  expect(screen.getByRole("dialog", { name: "어떤 과목을 공부했나요?" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "선택한 기록", hidden: true })).toBeNull();
  expect(
    within(grid).getByRole("button", { name: /새 기록 09:13.*09:29/, hidden: true }),
  ).toBeInTheDocument();
  expect(
    within(grid).queryByRole("img", { name: "직접 입력", hidden: true }),
  ).not.toBeInTheDocument();
  await userEvent.click(await screen.findByRole("button", { name: "과목 없음" }));
  expect(screen.getByRole("region", { name: "선택한 기록" })).toBeInTheDocument();
  expect(within(grid).getByRole("button", { name: /과목 없음 09:13.*09:29/ })).toBeInTheDocument();
  expect(within(grid).queryByRole("button", { name: /새 기록/ })).not.toBeInTheDocument();
  expect(calls).toEqual([]);
  await userEvent.click(screen.getByRole("button", { name: "완료" }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0]).toMatchObject({
    operations: [
      {
        action: "CREATE",
        startedAt: "2026-11-04T00:13:00.000Z",
        endedAt: "2026-11-04T00:29:00.000Z",
        subjectId: null,
      },
    ],
  });
});
it("기록 삭제 말풍선에서 확인해도 상단 저장 전에는 서버에서 삭제하지 않는다", async () => {
  const calls: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      return Response.json({
        results: body.operations.map((operation: { operationId: string }) => ({
          operationId: operation.operationId,
          success: true,
          key: null,
          status: 204,
          code: null,
          message: null,
        })),
      });
    }),
  );
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-11-04",
          records: [
            plannerRecord({
              startedAt: "2026-11-04T00:13:00Z",
              endedAt: "2026-11-04T00:29:00Z",
              subjectSegments: [],
            }),
          ],
        })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getAllByRole("button", { name: /09:13.*09:29/ })[0]!);
  await userEvent.click(screen.getByRole("button", { name: "기록 삭제" }));
  expect(screen.getByRole("alertdialog", { name: "이 기록을 삭제할까요?" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "삭제" }));
  expect(calls).toEqual([]);
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0]).toMatchObject({
    operations: [{ action: "DELETE", key: "c:2026-11-06T00:00:00Z" }],
  });
});

it("키보드로 1분 기록을 추가하고 기록 목록에서 다시 골라 저장한다", async () => {
  const calls: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      return Response.json({
        results: body.operations.map((operation: { operationId: string }) => ({
          operationId: operation.operationId,
          success: true,
          key: "m:keyboard",
          status: 201,
          code: null,
          message: null,
        })),
      });
    }),
  );
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({ date: "2026-11-04" })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  const add = screen.getByRole("button", { name: "기록 추가" });
  add.focus();
  await userEvent.keyboard("{Enter}");
  expect(screen.getByLabelText("시작")).toHaveFocus();
  fireEvent.change(screen.getByLabelText("시작"), { target: { value: "09:12" } });
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "09:13" } });
  await userEvent.click(screen.getByRole("button", { name: "완료" }));
  const list = screen.getByRole("list", { name: "기록 목록" });
  const record = within(list).getByRole("button", { name: /09:12.*09:13/ });
  record.focus();
  await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("region", { name: "선택한 기록" })).toBeInTheDocument();
  expect(screen.getByLabelText("시작")).toHaveValue("09:12");
  expect(screen.getByLabelText("끝")).toHaveValue("09:13");
  expect(calls).toEqual([]);
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0]).toMatchObject({
    operations: [
      {
        action: "CREATE",
        startedAt: "2026-11-04T00:12:00.000Z",
        endedAt: "2026-11-04T00:13:00.000Z",
        subjectId: null,
      },
    ],
  });
});

it("끌기의 끝점이 잘못되면 마지막 유효 초안으로 놓고 오류 없이 저장할 수 있다", async () => {
  class Pointer extends MouseEvent {
    readonly isPrimary = true;
    readonly pointerId = 1;
    readonly pointerType = "touch";
  }
  vi.stubGlobal("PointerEvent", Pointer);
  const calls: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      return Response.json({
        results: body.operations.map((operation: { operationId: string }) => ({
          operationId: operation.operationId,
          success: true,
          key: "c:updated",
          status: 200,
          code: null,
          message: null,
        })),
      });
    }),
  );
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-11-04",
          records: [
            plannerRecord({
              startedAt: "2026-11-04T00:13:00Z",
              endedAt: "2026-11-04T00:29:00Z",
              subjectSegments: [],
            }),
          ],
        })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getAllByRole("button", { name: /09:13.*09:29/ })[0]!);
  const grid = screen.getByLabelText("기록 편집 격자");
  grid.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 600,
    height: 672,
    right: 600,
    bottom: 672,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const end = screen.getByRole("button", { name: "끝 시각 조절" });
  fireEvent.pointerDown(end, { clientX: 290, clientY: 122 });
  fireEvent.pointerMove(grid, { clientX: 310, clientY: 122 });
  fireEvent.pointerMove(grid, { clientX: 120, clientY: 122 });
  expect(screen.getByRole("alert")).toHaveTextContent("시작과 끝을 다시 확인해 주세요");
  fireEvent.pointerUp(grid, { clientX: 120, clientY: 122 });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0]).toMatchObject({
    operations: [
      {
        action: "UPDATE",
        startedAt: "2026-11-04T00:13:00Z",
        endedAt: "2026-11-04T00:31:00.000Z",
      },
    ],
  });
});

it("초 원본의 과목만 바꾸면 시각 없이 저장한다", async () => {
  const requests: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      return Response.json({
        results: body.operations.map((operation: { operationId: string }) => ({
          operationId: operation.operationId,
          success: true,
          key: "c:updated",
          status: 200,
          code: null,
          message: null,
        })),
      });
    }),
  );
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-11-04",
          records: [
            plannerRecord({
              startedAt: "2026-11-04T00:12:20Z",
              endedAt: "2026-11-04T00:28:03Z",
              subjectSegments: [],
            }),
          ],
        })}
        subjects={[{ id: 4, name: "영어", colorIndex: 1, studySec: 0, focusSec: 0, tasks: [] }]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getAllByRole("button", { name: /09:13.*09:29/ })[0]!);
  await userEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
  await userEvent.click(await screen.findByRole("button", { name: "영어" }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]).toMatchObject({ operations: [{ action: "UPDATE", subjectId: 4 }] });
  const operation = (requests[0] as { operations: Record<string, unknown>[] }).operations[0]!;
  expect(operation).not.toHaveProperty("startedAt");
  expect(operation).not.toHaveProperty("endedAt");
});

it("두 번째 DST 회차를 손대지 않고 완료·저장하면 원래 시각을 이동하는 요청이 없다", async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ results: [] }));
  vi.stubGlobal("fetch", request);
  const close = vi.fn();
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-10-31",
          timeZone: "America/New_York",
          records: [
            plannerRecord({
              startedAt: "2026-11-01T06:20:00Z",
              endedAt: "2026-11-01T06:40:00Z",
              subjectSegments: [],
            }),
          ],
        })}
        subjects={[]}
        onClose={close}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getAllByRole("button", { name: /01:20.*01:40/ })[0]!);
  await userEvent.click(screen.getByRole("button", { name: "완료" }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(request).not.toHaveBeenCalled();
});

it("DST에서 끝만 고치면 두 번째 회차의 손대지 않은 시작 시각은 보존한다", async () => {
  const requests: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      return Response.json({
        results: body.operations.map((operation: { operationId: string }) => ({
          operationId: operation.operationId,
          success: true,
          key: "c:updated",
          status: 200,
          code: null,
          message: null,
        })),
      });
    }),
  );
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-10-31",
          timeZone: "America/New_York",
          records: [
            plannerRecord({
              startedAt: "2026-11-01T06:20:00Z",
              endedAt: "2026-11-01T06:40:00Z",
              subjectSegments: [],
            }),
          ],
        })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getAllByRole("button", { name: /01:20.*01:40/ })[0]!);
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "02:10" } });
  await userEvent.click(screen.getByRole("button", { name: "완료" }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]).toMatchObject({
    operations: [{ startedAt: "2026-11-01T06:20:00Z", endedAt: "2026-11-01T07:10:00.000Z" }],
  });
});

it("새로운 모호한 DST 시각을 입력하면 안내하고 batch 저장을 막는다", async () => {
  const request = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", request);
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-10-31",
          timeZone: "America/New_York",
          records: [
            plannerRecord({
              startedAt: "2026-11-01T04:10:00Z",
              endedAt: "2026-11-01T04:20:00Z",
              subjectSegments: [],
            }),
          ],
        })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getAllByRole("button", { name: /00:10.*00:20/ })[0]!);
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "01:30" } });
  expect(screen.getByRole("alert")).toHaveTextContent(
    "두 번 있는 시각이에요. 다른 시각을 골라 주세요",
  );
  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  expect(request).not.toHaveBeenCalled();
});

it("시간을 손대지 않은 기록 길이는 원본 초를 올림하고 시간 편집 뒤에는 초안 길이를 쓴다", async () => {
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-11-04",
          records: [
            plannerRecord({
              startedAt: "2026-11-04T00:12:59Z",
              endedAt: "2026-11-04T00:25:00Z",
              subjectSegments: [],
            }),
          ],
        })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getAllByRole("button", { name: /09:13.*09:25/ })[0]!);
  expect(screen.getByRole("region", { name: "선택한 기록" })).toHaveTextContent("12분 1초");
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "09:27" } });
  expect(screen.getByRole("region", { name: "선택한 기록" })).toHaveTextContent("14분 1초");
});

it("두 번째 DST 회차의 포인터 손잡이에서 끝만 끌어도 원래 시작 epoch를 보존한다", async () => {
  class Pointer extends MouseEvent {
    readonly isPrimary = true;
    readonly pointerId = 1;
    readonly pointerType = "touch";
  }
  vi.stubGlobal("PointerEvent", Pointer);
  const requests: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      return Response.json({
        results: body.operations.map((operation: { operationId: string }) => ({
          operationId: operation.operationId,
          success: true,
          key: "c:updated",
          status: 200,
          code: null,
          message: null,
        })),
      });
    }),
  );
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-10-31",
          timeZone: "America/New_York",
          records: [
            plannerRecord({
              startedAt: "2026-11-01T06:20:00Z",
              endedAt: "2026-11-01T06:40:00Z",
              subjectSegments: [],
            }),
          ],
        })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getAllByRole("button", { name: /01:20.*01:40/ })[0]!);
  const grid = screen.getByLabelText("기록 편집 격자");
  grid.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 600,
    height: 672,
    right: 600,
    bottom: 672,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  fireEvent.pointerDown(screen.getByRole("button", { name: "끝 시각 조절" }), {
    clientX: 400,
    clientY: 566,
  });
  fireEvent.pointerMove(grid, { clientX: 100, clientY: 594 });
  fireEvent.pointerUp(grid, { clientX: 100, clientY: 594 });
  expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]).toMatchObject({
    operations: [{ startedAt: "2026-11-01T06:20:00Z", endedAt: "2026-11-01T07:10:00.000Z" }],
  });
});

it("여러 시간 줄에 걸친 직접 입력 기록은 가장 넓은 구간 한 곳에 과목명과 직접 입력 표시를 보여 준다", () => {
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-11-04",
          subjects: [plannerSubject()],
          records: [
            plannerRecord({
              source: "MANUAL",
              startedAt: "2026-11-04T00:10:00Z",
              endedAt: "2026-11-04T02:20:00Z",
              subjectSegments: [
                {
                  subjectId: 3,
                  startedAt: "2026-11-04T00:10:00Z",
                  endedAt: "2026-11-04T02:20:00Z",
                  studySec: 7800,
                  focusSec: 7800,
                },
              ],
            }),
          ],
        })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  const grid = screen.getByLabelText("기록 편집 격자");
  expect(within(grid).getAllByText("수학")).toHaveLength(1);
  expect(within(grid).getByRole("img", { name: "직접 입력" })).toBeInTheDocument();
});

it("시간 손잡이를 끄는 동안 현재 끝 시각 말풍선을 보이고 놓으면 숨긴다", async () => {
  class Pointer extends MouseEvent {
    readonly isPrimary = true;
    readonly pointerId = 1;
    readonly pointerType = "touch";
  }
  vi.stubGlobal("PointerEvent", Pointer);
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-11-04",
          records: [
            plannerRecord({
              startedAt: "2026-11-04T00:13:00Z",
              endedAt: "2026-11-04T00:29:00Z",
              subjectSegments: [],
            }),
          ],
        })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getAllByRole("button", { name: /09:13.*09:29/ })[0]!);
  const grid = screen.getByLabelText("기록 편집 격자");
  grid.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 600,
    height: 672,
    right: 600,
    bottom: 672,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  fireEvent.pointerDown(screen.getByRole("button", { name: "끝 시각 조절" }), {
    clientX: 290,
    clientY: 122,
  });
  fireEvent.pointerMove(grid, { clientX: 310, clientY: 122 });
  expect(screen.getByRole("status")).toHaveTextContent("끝 09:31");
  fireEvent.pointerUp(grid, { clientX: 310, clientY: 122 });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("삭제 강조 사본도 실제 과목명·연필과 전체 시간 줄에 맞춘 10분 선을 유지한다", async () => {
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-11-04",
          subjects: [plannerSubject()],
          records: [
            plannerRecord({
              source: "MANUAL",
              startedAt: "2026-11-04T00:15:00Z",
              endedAt: "2026-11-04T00:45:00Z",
              subjectSegments: [
                {
                  subjectId: 3,
                  startedAt: "2026-11-04T00:15:00Z",
                  endedAt: "2026-11-04T00:45:00Z",
                  studySec: 1800,
                  focusSec: 1800,
                },
              ],
            }),
          ],
        })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  const grid = screen.getByLabelText("기록 편집 격자");
  const shape = within(grid).getByRole("button", { name: /09:15.*09:45/ });
  await userEvent.click(shape);
  shape.getBoundingClientRect = () => ({
    left: 210,
    top: 112,
    width: 300,
    height: 28,
    right: 510,
    bottom: 140,
    x: 210,
    y: 112,
    toJSON: () => ({}),
  });
  shape.parentElement!.getBoundingClientRect = () => ({
    left: 60,
    top: 112,
    width: 600,
    height: 28,
    right: 660,
    bottom: 140,
    x: 60,
    y: 112,
    toJSON: () => ({}),
  });
  const handleRects = [
    { left: 205.5, top: 107, width: 9, height: 24 },
    { left: 505.5, top: 121, width: 9, height: 24 },
  ];
  ["시작 시각 조절", "끝 시각 조절"].forEach((name, index) => {
    const handle = screen.getByRole("button", { name }).querySelector("span")!;
    const rect = handleRects[index]!;
    handle.getBoundingClientRect = () => ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    });
  });
  await userEvent.click(screen.getByRole("button", { name: "기록 삭제" }));
  const dialog = screen.getByRole("alertdialog", { name: "이 기록을 삭제할까요?" });
  const label = within(dialog).getByText("수학");
  const highlight = label.closest<HTMLElement>("[inert]")!;
  expect(highlight).toHaveAttribute("aria-hidden", "true");
  expect(within(highlight).getByRole("img", { hidden: true })).toHaveAttribute(
    "aria-label",
    "직접 입력",
  );
  expect(
    [...highlight.querySelectorAll<HTMLElement>("[data-record-grid-line]")].map(
      (line) => line.style.left,
    ),
  ).toEqual(["49px", "149px", "249px"]);
  expect(highlight.querySelectorAll("button, input, [tabindex], [id]")).toHaveLength(0);
  const handles = [...dialog.querySelectorAll<HTMLElement>("[data-record-delete-handle]")];
  expect(handles).toHaveLength(2);
  handles.forEach((handle, index) => {
    const rect = handleRects[index]!;
    expect(handle).toHaveAttribute("aria-hidden", "true");
    expect(handle).toHaveAttribute("inert");
    expect(handle).toHaveStyle({
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    expect(handle.querySelectorAll("button, input, [tabindex], [id]")).toHaveLength(0);
  });
  await userEvent.click(within(dialog).getByRole("button", { name: "취소" }));
  expect(within(grid).getByRole("button", { name: /09:15.*09:45/ })).toBeInTheDocument();
});

it("편집 날짜의 IANA 현재 시각을 해당 시간 줄과 분 위치에 표시한다", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T03:15:00Z"));
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({ date: "2026-11-05", timeZone: "America/New_York" })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  expect(screen.getByText("22:15")).toBeInTheDocument();
  expect(screen.queryByText("22:00")).not.toBeInTheDocument();
  const marker = screen.getByRole("img", { name: "현재 시각 22:15" });
  expect(marker).toHaveStyle({ left: "25%" });
  expect(marker).not.toHaveAttribute("tabindex");
});

it("스크롤로 격자 원점이 화면 위로 이동해도 32px 시간 줄의 끝 손잡이는 1분씩 고친다", async () => {
  class Pointer extends MouseEvent {
    readonly isPrimary = true;
    readonly pointerId = 1;
    readonly pointerType = "touch";
  }
  vi.stubGlobal("PointerEvent", Pointer);
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-11-04",
          records: [
            plannerRecord({
              startedAt: "2026-11-04T00:13:00Z",
              endedAt: "2026-11-04T00:29:00Z",
              subjectSegments: [],
            }),
          ],
        })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getAllByRole("button", { name: /09:13.*09:29/ })[0]!);
  const grid = screen.getByLabelText("기록 편집 격자");
  grid.getBoundingClientRect = () => ({
    left: 66,
    top: -100,
    width: 304,
    height: 768,
    right: 370,
    bottom: 668,
    x: 66,
    y: -100,
    toJSON: () => ({}),
  });
  fireEvent.pointerDown(screen.getByRole("button", { name: "끝 시각 조절" }), {
    clientX: 66 + (304 * 29) / 60,
    clientY: 52,
  });
  fireEvent.pointerMove(grid, { clientX: 218, clientY: 52 });
  expect(screen.getByRole("status")).toHaveTextContent("끝 09:30");
  fireEvent.pointerUp(grid, { clientX: 218, clientY: 52 });
  expect(screen.getByLabelText("끝")).toHaveValue("09:30");
  expect(screen.getByLabelText("시작")).toHaveValue("09:13");
});

it("시간 요약에서 1분 입력을 펼치고 접어도 입력값을 보존하며 키보드 포커스로 다시 펼친다", async () => {
  const request = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", request);
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-11-04",
          records: [
            plannerRecord({
              startedAt: "2026-11-04T00:13:00Z",
              endedAt: "2026-11-04T00:29:00Z",
              subjectSegments: [],
            }),
          ],
        })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getAllByRole("button", { name: /09:13.*09:29/ })[0]!);
  const summary = screen.getByRole("button", { name: "09:13 – 09:29" });
  expect(summary).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(summary);
  expect(summary).toHaveAttribute("aria-expanded", "true");
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "09:30" } });
  await userEvent.click(summary);
  expect(summary).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByLabelText("끝")).toHaveValue("09:30");
  act(() => screen.getByLabelText("시작").focus());
  expect(summary).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByLabelText("시작")).toHaveValue("09:13");
  expect(request).not.toHaveBeenCalled();
});
it("05시 밖의 전체 시작 시각을 입력으로 바꿔도 끝의 소수초를 보존한다", async () => {
  const requests: { operations: Record<string, unknown>[] }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      return Response.json({
        results: body.operations.map((op: Record<string, unknown>) => ({
          operationId: op.operationId,
          success: true,
          key: op.key,
          status: 200,
          code: null,
          message: null,
        })),
      });
    }),
  );
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-11-04",
          records: [
            plannerRecord({
              startedAt: "2026-11-03T20:00:00Z",
              endedAt: "2026-11-03T21:00:03Z",
              fullStartedAt: "2026-11-03T19:30:12.123456Z",
              fullEndedAt: "2026-11-03T21:00:03.654321Z",
              subjectSegments: [],
            }),
          ],
        })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getAllByRole("button", { name: /04:31.*06:01/ })[0]!);
  fireEvent.change(screen.getByLabelText("시작"), { target: { value: "04:35" } });
  expect(screen.getByRole("alert")).toHaveTextContent("기록 전체에 적용할 과목을 먼저 골라 주세요");
  expect(requests).toHaveLength(0);
  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
  expect(
    screen.getByText("선택한 과목은 화면에 보이지 않는 시간까지 기록 전체에 적용돼요."),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "과목 없음" }));
  fireEvent.change(screen.getByLabelText("시작"), { target: { value: "04:36" } });
  fireEvent.change(screen.getByLabelText("시작"), { target: { value: "04:35" } });
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]?.operations[0]).toMatchObject({
    startedAt: "2026-11-03T19:35:00.000Z",
    endedAt: "2026-11-03T21:00:03.654321Z",
  });
});
