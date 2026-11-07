import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PlannerRecordEditor } from "../PlannerRecordEditor";
import { plannerDay, plannerRecord, plannerSubject } from "@/test/plannerFixtures";
import { subjectColorVar } from "@/features/records/recordsTimetable";

const subjects = [
  { id: 3, name: "수학", colorIndex: 2, studySec: 0, focusSec: 0, tasks: [] },
  { id: 4, name: "영어", colorIndex: 1, studySec: 0, focusSec: 0, tasks: [] },
];
function mount(source: "MANUAL" | "MEASURED") {
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  const day = plannerDay({
    date: "2026-11-06",
    subjects: [plannerSubject()],
    records: [plannerRecord({ source })],
  });
  function Harness() {
    const [open, setOpen] = useState(true);
    return open ? (
      <PlannerRecordEditor
        day={day}
        subjects={subjects}
        onClose={() => setOpen(false)}
        onSaved={async () => {}}
      />
    ) : (
      <button onClick={() => setOpen(true)}>다시 편집</button>
    );
  }
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );
  return request;
}
function record() {
  return screen.getByLabelText("기록 편집 격자").querySelector<HTMLElement>("[data-record]")!;
}
function choose(name: string) {
  fireEvent.click(record());
  fireEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name }));
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each(["MANUAL", "MEASURED"] as const)(
  "%s 기록의 과목만 바꿔도 저장 전 시간표 색을 즉시 바꾼다",
  (source) => {
    const request = mount(source);
    expect(record().getAttribute("style")).toContain(subjectColorVar(2));
    choose("영어");
    expect(record()).toHaveAccessibleName(/영어/);
    expect(record().getAttribute("style")).toContain(subjectColorVar(1));
    choose("과목 없음");
    expect(record().getAttribute("style")).toContain("var(--primary)");
    expect(request).not.toHaveBeenCalled();
  },
);
it("편집을 버리고 다시 열면 원래 과목 색을 유지한다", () => {
  const request = mount("MEASURED");
  choose("영어");
  expect(record().getAttribute("style")).toContain(subjectColorVar(1));
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "나가기" }));
  fireEvent.click(screen.getByRole("button", { name: "다시 편집" }));
  expect(record()).toHaveAccessibleName(/수학/);
  expect(record().getAttribute("style")).toContain(subjectColorVar(2));
  expect(request).not.toHaveBeenCalled();
});
it("과목 선택창을 취소하면 원래 미리보기 색을 바꾸지 않는다", () => {
  const request = mount("MEASURED");
  fireEvent.click(record());
  fireEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(record().getAttribute("style")).toContain(subjectColorVar(2));
  expect(request).not.toHaveBeenCalled();
});
