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

  it("설명이 있으면 확인 창의 설명으로 읽힌다", () => {
    render(
      <ConfirmDialog
        open
        title="민준님을 내보낼까요?"
        description="민준님은 3일 동안 다시 들어올 수 없어요"
        cancelLabel="취소"
        confirmLabel="내보내기"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription(
      "민준님은 3일 동안 다시 들어올 수 없어요",
    );
  });

  it("확인 버튼 색을 표시로 드러낸다", () => {
    render(
      <ConfirmDialog
        open
        title="수빈님에게 그룹장을 넘길까요?"
        cancelLabel="취소"
        confirmLabel="넘기기"
        confirmTone="primary"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "넘기기" })).toHaveAttribute("data-tone", "primary");
  });

  it("넘기지 않으면 지금처럼 빨간 확인 버튼이고 설명이 없다", () => {
    render(
      <ConfirmDialog
        open
        title="삭제할까요?"
        cancelLabel="취소"
        confirmLabel="삭제"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "삭제" })).toHaveAttribute("data-tone", "danger");
    expect(screen.getByRole("alertdialog")).not.toHaveAttribute("aria-describedby");
  });

  it("보내는 중에는 확인을 누를 수 없고 취소, Esc, 딤으로도 닫히지 않는다", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        pending
        title="민준님을 내보낼까요?"
        cancelLabel="취소"
        confirmLabel="내보내기"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    const dialog = screen.getByRole("alertdialog", { name: "민준님을 내보낼까요?" });

    expect(within(dialog).getByRole("button", { name: "내보내기" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "취소" })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    const dim = document.querySelector<HTMLElement>(
      '[data-state="open"]:not([role="alertdialog"])',
    );
    if (dim !== null) fireEvent.pointerDown(dim);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "민준님을 내보낼까요?" })).toBeInTheDocument();
  });
});
