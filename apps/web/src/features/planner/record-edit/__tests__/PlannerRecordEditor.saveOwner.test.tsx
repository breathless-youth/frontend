import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as tokenSource from "@/lib/auth/tokenSource";
import { PlannerRecordEditor } from "../PlannerRecordEditor";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("토큰만 먼저 다른 계정으로 바뀌어도 이전 편집기의 저장 요청은 보내지 않는다", async () => {
  let userId = 7;
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  vi.spyOn(tokenSource, "getTokenSource").mockReturnValue({
    getUserId: () => userId,
    getAccessToken: async () => "token",
    getCurrentToken: () => "token",
    refresh: async () => "token",
    hasSettled: () => true,
    subscribe: () => () => {},
  });
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        userId={7}
        day={plannerDay({ records: [plannerRecord({ subjectSegments: [] })] })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getAllByRole("button", { name: /09:00.*10:00/ })[0]!);
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "10:10" } });
  userId = 8;
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("저장하지 못한 기록이 있어요"),
  );
  expect(request).not.toHaveBeenCalled();
});
