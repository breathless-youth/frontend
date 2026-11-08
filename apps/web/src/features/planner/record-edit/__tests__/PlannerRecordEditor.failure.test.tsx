import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { plannerDay, plannerRangeRecord as plannerRecord } from "@/test/plannerFixtures";
import { PlannerRecordEditor } from "../PlannerRecordEditor";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each([
  { status: 409, text: "다른 기록과 충돌했어요" },
  { status: 400, text: "기록의 시간과 과목을 확인해 주세요" },
  { status: 404, text: "기록이나 과목을 찾을 수 없어요" },
  { status: 500, text: "서버에서 저장하지 못했어요" },
  { status: null, text: "저장 결과를 확인하지 못했어요" },
])("저장 실패 $status의 원인을 일반 재시도 안내와 구분한다", async ({ status, text }) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (status === null) throw new TypeError("network unavailable");
      const body = JSON.parse(String(init?.body));
      return Response.json({
        results: body.operations.map((operation: { operationId: string }) => ({
          operationId: operation.operationId,
          success: false,
          key: null,
          status,
          code: "CONFLICT",
          message: "untrusted server details",
        })),
      });
    }),
  );
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({ records: [plannerRecord({ subjectSegments: [] })] })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getAllByRole("button", { name: /09:00.*10:00/ })[0]!);
  fireEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
  fireEvent.click(screen.getByRole("button", { name: "과목 없음" }));
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(text);
  expect(screen.getByRole("alert")).not.toHaveTextContent("untrusted server details");
});
