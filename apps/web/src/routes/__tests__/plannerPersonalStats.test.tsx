import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import type * as UserIdModule from "@/lib/userId";

import { personalRecordsKeys } from "@/lib/personalRecordsQueries";
import { personalRecordStats } from "@/test/personalRecordFixtures";
import { plannerDay, plannerRangeRecord as plannerRecord } from "@/test/plannerFixtures";
import { PlannerPage } from "../PlannerPage";
import "@/features/planner/record-edit/PlannerRecordEditor";

vi.mock("@/lib/userId", async (original) => ({
  ...(await original<typeof UserIdModule>()),
  useUserId: () => 7,
  hasTokenSource: () => true,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each([false, true])(
  "기록 저장의 부분 실패=%s 뒤에도 같은 문서의 개인 통계 캐시를 갱신한다",
  async (partial) => {
    const day = plannerDay({
      date: "2026-11-07",
      records: [
        plannerRecord({
          key: "c:first",
          startedAt: "2026-11-07T00:00:00Z",
          endedAt: "2026-11-07T01:00:00Z",
          subjectSegments: [],
        }),
        ...(partial
          ? [
              plannerRecord({
                key: "c:second",
                startedAt: "2026-11-07T02:00:00Z",
                endedAt: "2026-11-07T03:00:00Z",
                subjectSegments: [],
              }),
            ]
          : []),
      ],
    });
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.includes("/api/planner/days/")) return Response.json(day);
      if (url.includes("/api/subjects")) return Response.json([]);
      if (url.includes("/api/planner/records/batch")) {
        const body = JSON.parse(String(init?.body));
        day.records[0]!.revision = 1;
        return Response.json({
          results: body.operations.map(
            (operation: { operationId: string; key: string }, index: number) => ({
              operationId: operation.operationId,
              success: !partial || index === 0,
              key: operation.key,
              revision: 1,
              status: partial && index > 0 ? 409 : 200,
              code: partial && index > 0 ? "CONFLICT" : null,
              message: null,
            }),
          ),
        });
      }
      return new Response(null, { status: 404 });
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const keys = [
      personalRecordsKeys.daily(7, "2026-11-07", "Asia/Seoul"),
      personalRecordsKeys.period(
        7,
        { from: "2026-11-01", to: "2026-11-30" },
        undefined,
        "Asia/Seoul",
      ),
      personalRecordsKeys.rhythm(7, "Asia/Seoul"),
    ];
    for (const key of keys) client.setQueryData(key, personalRecordStats());
    const otherAccount = personalRecordsKeys.daily(8, "2026-11-07", "Asia/Seoul");
    client.setQueryData(otherAccount, personalRecordStats());
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/planner?date=2026-11-07&edit=records"]}>
          <PlannerPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click((await screen.findAllByRole("button", { name: /09:00.*10:00/ }))[0]!);
    fireEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
    fireEvent.click(screen.getByRole("button", { name: "과목 없음" }));
    if (partial) {
      fireEvent.click(screen.getAllByRole("button", { name: /11:00.*12:00/ })[0]!);
      fireEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
      fireEvent.click(screen.getByRole("button", { name: "과목 없음" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() =>
      expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([
        true,
        true,
        true,
      ]),
    );
    expect(client.getQueryState(otherAccount)?.isInvalidated).toBe(false);
    client.clear();
  },
);
