import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { Accordion } from "@/components/ui/accordion";
import { personalRecord } from "@/test/personalRecordFixtures";
import { SessionListItem } from "../SessionListItem";

afterEach(cleanup);

it("원본 세션 ID가 없는 직접 입력 기록을 문자열 표시 키로 펼쳐 수정한다", () => {
  const record = personalRecord();
  const edit = vi.fn();
  render(
    <Accordion type="single" collapsible defaultValue="manual:2026-11-07:0">
      <SessionListItem session={record} onEdit={edit} />
    </Accordion>,
  );
  expect(screen.getByText("과목 없음")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "수정" }));
  expect(edit).toHaveBeenCalledWith(record);
});

it("과목 없는 수정 측정 기록도 출처를 바꾸지 않고 연필과 편집 입구를 표시한다", () => {
  const record = personalRecord({ source: "MEASURED", originalSessionId: 9 });
  const edit = vi.fn();
  render(
    <Accordion type="single" collapsible defaultValue="manual:2026-11-07:0">
      <SessionListItem session={record} onEdit={edit} />
    </Accordion>,
  );
  expect(screen.getByRole("img", { name: "수정됨" })).toBeVisible();
  expect(screen.queryByText("직접 입력")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "수정" }));
  expect(edit).toHaveBeenCalledWith(record);
});
