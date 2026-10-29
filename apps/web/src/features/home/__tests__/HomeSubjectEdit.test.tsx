import type { SubjectResponse } from "@focusmakers/types";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HomeSubjectEdit, type EditStore } from "../HomeSubjectEdit";

const subject = (id: number, name: string): SubjectResponse => ({
  id,
  name,
  colorIndex: id,
  studySec: 0,
  focusSec: 0,
  tasks: [],
});

function renderEdit(subjects = [subject(1, "국어"), subject(2, "수학")]) {
  const store: EditStore = {
    subjects,
    renameSubject: vi.fn(() => Promise.resolve()),
    removeSubject: vi.fn(() => Promise.resolve()),
  };
  const props = { store, onDone: vi.fn(), onAddSubject: vi.fn(), onNotice: vi.fn() };
  render(<HomeSubjectEdit {...props} />);
  return props;
}

describe("HomeSubjectEdit", () => {
  it("제목·완료와 과목마다 이름 입력·삭제 버튼, 아래에 과목 추가가 있다", async () => {
    const { onDone, onAddSubject } = renderEdit();

    expect(screen.getByRole("heading", { name: "과목 편집" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "국어 이름" })).toHaveValue("국어");
    expect(screen.getByRole("button", { name: "수학 삭제" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "과목 추가" }));
    expect(onAddSubject).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("이름을 고치고 Enter나 포커스 이탈로 저장하고, 그대로거나 비우면 저장하지 않는다", async () => {
    const { store } = renderEdit();
    const korean = screen.getByRole("textbox", { name: "국어 이름" });

    await userEvent.clear(korean);
    await userEvent.type(korean, "문학{Enter}");
    expect(store.renameSubject).toHaveBeenCalledExactlyOnceWith(1, "문학");

    const math = screen.getByRole("textbox", { name: "수학 이름" });
    await userEvent.clear(math);
    await userEvent.tab();
    expect(store.renameSubject).toHaveBeenCalledTimes(1);
    expect(math).toHaveValue("수학");
  });

  it("한도를 넘긴 이름은 저장하지 않고 알린다", async () => {
    const { store } = renderEdit();
    const korean = screen.getByRole("textbox", { name: "국어 이름" });

    await userEvent.clear(korean);
    await userEvent.type(korean, "가나다라마바사아자차카타파{Enter}");

    expect(store.renameSubject).not.toHaveBeenCalled();
    expect(screen.getByText("12자까지 쓸 수 있어요")).toBeInTheDocument();
  });

  it("삭제를 누르면 받침에 맞는 조사로 확인을 묻고, 삭제를 고르면 삭제한다", async () => {
    const { store } = renderEdit();

    await userEvent.click(screen.getByRole("button", { name: "수학 삭제" }));
    const dialog = screen.getByRole("alertdialog", { name: '"수학"을 삭제할까요?' });
    expect(within(dialog).getByText("공부한 시간은 기록에 남아요.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(store.removeSubject).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "국어 삭제" }));
    await userEvent.click(
      within(screen.getByRole("alertdialog", { name: '"국어"를 삭제할까요?' })).getByRole(
        "button",
        { name: "삭제" },
      ),
    );
    expect(store.removeSubject).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("과목이 20개면 시트를 열지 않고 알린다", async () => {
    const { onAddSubject, onNotice } = renderEdit(
      Array.from({ length: 20 }, (_, index) => subject(index + 1, `과목${String(index)}`)),
    );

    await userEvent.click(screen.getByRole("button", { name: "과목 추가" }));

    expect(onAddSubject).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenCalledWith("과목은 최대 20개까지 만들 수 있어요");
  });
});
