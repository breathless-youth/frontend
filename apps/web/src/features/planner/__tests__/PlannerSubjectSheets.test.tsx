import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SubjectResponse } from "@focusmakers/types";
import { ApiError } from "@/lib/api";

import { PlannerSubjectSheets } from "../PlannerSubjectSheets";

function subject(id: number, name: string): SubjectResponse {
  return { id, name, colorIndex: id, studySec: 0, focusSec: 0, tasks: [] };
}

describe("PlannerSubjectSheets", () => {
  it.each([
    [new ApiError("already exists", 409, "CONFLICT"), "이미 같은 이름의 과목이 있어요"],
    [new ApiError("invalid", 400, "BAD_REQUEST"), "잠시 후 다시 시도해 주세요"],
    [new TypeError("offline"), "잠시 후 다시 시도해 주세요"],
  ])("과목 생성 실패 원인을 구분하고 입력한 이름을 보존한다: %s", async (error, message) => {
    const onCreateSubject = vi.fn().mockRejectedValue(error);
    const onAddSubjects = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <PlannerSubjectSheets
        open
        onOpenChange={onOpenChange}
        dateKey="2026-11-06"
        subjects={[subject(3, "수학")]}
        includedSubjectIds={[]}
        onAddSubjects={onAddSubjects}
        onCreateSubject={onCreateSubject}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "새 과목" }));
    const input = screen.getByRole("textbox", { name: "과목 이름" });
    await userEvent.type(input, "수학");
    await userEvent.click(screen.getByRole("button", { name: "만들기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(input).toHaveValue("수학");
    expect(onAddSubjects).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    await userEvent.type(input, " 복습");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("이미 그날에 있는 과목은 막고 고른 과목만 표시한 날짜에 추가한다", async () => {
    const onAddSubjects = vi.fn(async () => {});
    const onOpenChange = vi.fn();
    render(
      <PlannerSubjectSheets
        open
        onOpenChange={onOpenChange}
        dateKey="2026-11-06"
        subjects={[subject(3, "국어"), subject(8, "수학")]}
        includedSubjectIds={[3]}
        onAddSubjects={onAddSubjects}
        onCreateSubject={async (name) => subject(9, name)}
      />,
    );

    expect(screen.getByRole("button", { name: "국어, 이미 들어 있어요" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "수학" }));
    expect(screen.getByRole("button", { name: "수학" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "1개 추가" }));

    await waitFor(() => expect(onAddSubjects).toHaveBeenCalledWith("2026-11-06", [8]));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("새 과목을 만들면 보고 있던 날짜에 바로 추가한다", async () => {
    const onCreateSubject = vi.fn(async (name: string) => subject(9, name));
    const onAddSubjects = vi.fn(async () => {});
    render(
      <PlannerSubjectSheets
        open
        onOpenChange={vi.fn()}
        dateKey="2026-11-06"
        subjects={[subject(3, "국어")]}
        includedSubjectIds={[]}
        onAddSubjects={onAddSubjects}
        onCreateSubject={onCreateSubject}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "새 과목" }));
    await userEvent.type(screen.getByRole("textbox", { name: "과목 이름" }), "물리학");
    await userEvent.click(screen.getByRole("button", { name: "만들기" }));

    await waitFor(() => expect(onCreateSubject).toHaveBeenCalledWith("물리학"));
    expect(onAddSubjects).toHaveBeenCalledWith("2026-11-06", [9]);
  });

  it("생성 뒤 날짜 선택만 실패한 경우 재시도에서 과목을 다시 만들지 않는다", async () => {
    const onCreateSubject = vi.fn(async (name: string) => subject(9, name));
    const onAddSubjects = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("selection conflict", 409, "CONFLICT"))
      .mockResolvedValue(undefined);
    render(
      <PlannerSubjectSheets
        open
        onOpenChange={vi.fn()}
        dateKey="2026-11-06"
        subjects={[]}
        includedSubjectIds={[]}
        onAddSubjects={onAddSubjects}
        onCreateSubject={onCreateSubject}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "새 과목" }));
    await userEvent.type(screen.getByRole("textbox", { name: "과목 이름" }), "물리학");
    await userEvent.click(screen.getByRole("button", { name: "만들기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("잠시 후 다시 시도해 주세요");
    expect(screen.getByRole("textbox", { name: "과목 이름" })).toHaveValue("물리학");

    await userEvent.click(screen.getByRole("button", { name: "만들기" }));

    await waitFor(() => expect(onAddSubjects).toHaveBeenCalledTimes(2));
    expect(onCreateSubject).toHaveBeenCalledTimes(1);
    expect(onAddSubjects).toHaveBeenLastCalledWith("2026-11-06", [9]);
  });

  it("전체 과목이 20개면 새 과목 타일을 숨기고 한도를 표시한다", () => {
    render(
      <PlannerSubjectSheets
        open
        onOpenChange={vi.fn()}
        dateKey="2026-11-06"
        subjects={Array.from({ length: 20 }, (_, index) => subject(index + 1, `과목 ${index + 1}`))}
        includedSubjectIds={[]}
        onAddSubjects={async () => {}}
        onCreateSubject={async (name) => subject(21, name)}
      />,
    );

    expect(screen.queryByRole("button", { name: "새 과목" })).not.toBeInTheDocument();
    expect(screen.getByText("과목은 20개까지 만들 수 있어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "과목 20" })).toBeEnabled();
  });

  it("12자를 넘겨도 이름을 보존하고 Enter와 만들기를 막는다", async () => {
    const onCreateSubject = vi.fn(async (name: string) => subject(9, name));
    render(
      <PlannerSubjectSheets
        open
        onOpenChange={vi.fn()}
        dateKey="2026-11-06"
        subjects={[]}
        includedSubjectIds={[]}
        onAddSubjects={async () => {}}
        onCreateSubject={onCreateSubject}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "새 과목" }));
    const input = screen.getByRole("textbox", { name: "과목 이름" });
    await userEvent.type(input, "가".repeat(13));

    expect(input).toHaveValue("가".repeat(13));
    expect(screen.getByRole("button", { name: "만들기" })).toBeDisabled();
    expect(screen.getByText("12자까지 쓸 수 있어요")).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(onCreateSubject).not.toHaveBeenCalled();
  });

  it("과목을 아직 받지 못했을 때 새 과목 생성을 열지 않는다", () => {
    render(
      <PlannerSubjectSheets
        open
        onOpenChange={vi.fn()}
        dateKey="2026-11-06"
        subjects={undefined}
        includedSubjectIds={[]}
        onAddSubjects={async () => {}}
        onCreateSubject={async (name) => subject(9, name)}
      />,
    );

    expect(screen.getByRole("status")).toHaveAccessibleName("불러오는 중");
    expect(screen.queryByRole("button", { name: "새 과목" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "0개 추가" })).toBeDisabled();
  });

  it("과목 조회가 실패하면 다시 시도할 수 있다", async () => {
    const retry = vi.fn();
    render(
      <PlannerSubjectSheets
        open
        onOpenChange={vi.fn()}
        dateKey="2026-11-06"
        subjects={undefined}
        includedSubjectIds={[]}
        loadError={{ retry }}
        onAddSubjects={async () => {}}
        onCreateSubject={async (name) => subject(9, name)}
      />,
    );

    expect(screen.getByText("과목을 불러오지 못했어요")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
