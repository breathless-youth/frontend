import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "../confirm-dialog";

function renderDialog() {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      open
      title="이 기록을 지울까요?"
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

  it("Esc는 취소다", () => {
    const { onCancel, onConfirm, dialog } = renderDialog();

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
