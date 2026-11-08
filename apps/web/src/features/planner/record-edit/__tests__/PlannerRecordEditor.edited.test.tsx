import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it } from "vitest";

import { plannerDay, plannerRangeRecord as plannerRecord } from "@/test/plannerFixtures";
import { PlannerRecordEditor } from "../PlannerRecordEditor";

afterEach(cleanup);

it("과목 없는 측정 기록의 수정 여부를 새 서버 응답만으로 다시 표시한다", () => {
  const mount = () =>
    render(
      <MemoryRouter>
        <PlannerRecordEditor
          day={plannerDay({
            records: [{ ...plannerRecord({ subjectSegments: [] }), edited: true }],
          })}
          subjects={[]}
          onClose={() => {}}
          onSaved={async () => {}}
        />
      </MemoryRouter>,
    );
  const first = mount();
  expect(screen.getAllByRole("img", { name: "수정됨" }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("img", { name: "직접 입력" })).not.toBeInTheDocument();
  first.unmount();
  mount();
  expect(screen.getAllByRole("img", { name: "수정됨" }).length).toBeGreaterThan(0);
});

it("선택 범위를 옮기는 동안 원본을 수정하지 않고 과목 변경부터 연필을 표시한다", () => {
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({ records: [plannerRecord({ subjectSegments: [], edited: false })] })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  expect(screen.queryByRole("img", { name: "수정됨" })).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: /09:00.*10:00/ })[0]!);
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "09:02" } });
  expect(screen.queryByRole("img", { name: "수정됨" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "과목 없음" }));
  expect(screen.getAllByRole("img", { name: "수정됨" }).length).toBeGreaterThan(0);
});

it("연필을 넣기 어려운 짧은 기록도 선택하면 패널에서 수정 여부를 확인할 수 있다", () => {
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          records: [
            plannerRecord({
              startedAt: "2026-11-06T13:29:49.686Z",
              endedAt: "2026-11-06T13:29:53.341Z",
              subjectSegments: [],
              edited: true,
            }),
          ],
        })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getAllByRole("button", { name: /22:29.*22:30.*수정됨/ })[0]!);
  expect(
    within(screen.getByRole("region", { name: "선택한 기록" })).getByRole("img", {
      name: "수정됨",
    }),
  ).toBeVisible();
});

it("수정한 과목 없음 기록의 삭제 미리보기에도 연필을 유지한다", () => {
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({ records: [plannerRecord({ subjectSegments: [], edited: true })] })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getAllByRole("button", { name: /09:00.*10:00/ })[0]!);
  fireEvent.click(screen.getByRole("button", { name: "기록 삭제" }));
  expect(screen.getByRole("alertdialog").querySelector('svg[aria-label="수정됨"]')).not.toBeNull();
});
