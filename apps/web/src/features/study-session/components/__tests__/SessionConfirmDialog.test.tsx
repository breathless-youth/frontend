import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { SessionConfirmDialog } from "../SessionConfirmDialog";

function setup(overrides: Partial<Parameters<typeof SessionConfirmDialog>[0]> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <>
      <button type="button">종료</button>
      <SessionConfirmDialog
        open
        title="공부를 마칠까요"
        description="지금까지 30분 공부했어요"
        cancelLabel="계속하기"
        confirmLabel="공부 종료"
        onCancel={onCancel}
        onConfirm={onConfirm}
        {...overrides}
      />
    </>,
  );
  return { onCancel, onConfirm };
}

describe("SessionConfirmDialog", () => {
  it("경고 다이얼로그로 노출되고 제목과 본문이 연결된다", () => {
    setup();

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("공부를 마칠까요");
    expect(dialog).toHaveAccessibleDescription("지금까지 30분 공부했어요");
  });

  it("초기 포커스는 비파괴 버튼에 놓인다", () => {
    setup();

    // 종료는 되돌릴 수 없어 엔터를 잘못 눌러도 끝나지 않아야 한다.
    expect(screen.getByRole("button", { name: "계속하기" })).toHaveFocus();
  });

  it("Escape 는 비파괴 취소로 닫는다", async () => {
    const { onCancel, onConfirm } = setup();

    await userEvent.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("딤을 탭하면 비파괴 취소가 불린다", async () => {
    const { onCancel, onConfirm } = setup();
    const dim = document.querySelector<HTMLElement>(
      '[data-state="open"]:not([role="alertdialog"])',
    );
    if (dim === null) throw new Error("딤을 찾지 못했다");

    await userEvent.click(dim);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("반경이 sm 이상에서도 유지된다", () => {
    // 공용 dialog 의 sm:rounded-lg 가 base rounded-xl 과 다른 modifier 라 640px 이상에서
    // 반경을 16px 로 줄인다. sm:rounded-xl 로 같은 modifier 를 맞춰 막는다.
    setup();

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.className).toContain("sm:rounded-xl");
    expect(dialog.className).not.toContain("sm:rounded-lg");
  });

  it("닫으면 열기 전 포커스로 돌아간다", async () => {
    const onCancel = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            종료
          </button>
          <SessionConfirmDialog
            open={open}
            title="공부를 마칠까요"
            description="지금까지 30분 공부했어요"
            cancelLabel="계속하기"
            confirmLabel="공부 종료"
            onCancel={() => {
              onCancel();
              setOpen(false);
            }}
            onConfirm={vi.fn()}
          />
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "종료" });

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "계속하기" }));

    expect(trigger).toHaveFocus();
  });
});
