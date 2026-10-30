import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "../confirm-dialog";

function renderDialog(description?: string) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      open
      title="이 기록을 지울까요?"
      description={description}
      cancelLabel="취소"
      confirmLabel="지우기"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );
  return {
    onCancel,
    onConfirm,
    dialog: screen.getByRole("alertdialog", { name: "이 기록을 지울까요?" }),
  };
}

describe("ConfirmDialog", () => {
  it("제목과 두 버튼을 받은 문구로 보여 주고 각 버튼이 자기 콜백을 부른다", () => {
    const { onCancel, onConfirm, dialog } = renderDialog();

    fireEvent.click(within(dialog).getByRole("button", { name: "지우기" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("설명을 넘기면 설명 줄을 그리고 다이얼로그 설명으로 연결한다", () => {
    const { dialog } = renderDialog("공부한 시간은 기록에 남아요.");

    expect(dialog).toHaveAccessibleDescription("공부한 시간은 기록에 남아요.");
  });

  it("설명이 없으면 aria-describedby를 달지 않는다", () => {
    const { dialog } = renderDialog();

    expect(dialog).not.toHaveAttribute("aria-describedby");
  });

  it("Esc는 취소다", () => {
    const { onCancel, onConfirm, dialog } = renderDialog();

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
