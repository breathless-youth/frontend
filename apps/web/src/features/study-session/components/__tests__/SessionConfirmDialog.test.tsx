import { render, screen, waitFor } from "@testing-library/react";
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

  it("확인 버튼은 따로 넘기지 않으면 세션 확인 색이다", () => {
    setup();

    expect(screen.getByRole("button", { name: "공부 종료" })).toHaveAttribute(
      "data-tone",
      "confirm",
    );
  });

  it("되돌리기 어려운 확인은 빨간 확인 버튼으로 드러낸다", () => {
    setup({ confirmTone: "danger", confirmLabel: "내보내기" });

    expect(screen.getByRole("button", { name: "내보내기" })).toHaveAttribute("data-tone", "danger");
  });

  it("보내는 중에는 두 버튼을 막고 Escape와 딤으로도 닫지 않는다", async () => {
    const { onCancel, onConfirm } = setup({ pending: true });

    expect(screen.getByRole("button", { name: "계속하기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "공부 종료" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    const dim = document.querySelector<HTMLElement>(
      '[data-state="open"]:not([role="alertdialog"])',
    );
    if (dim === null) throw new Error("딤을 찾지 못했다");
    await userEvent.click(dim);

    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("다른 사람의 이름이 든 창은 클릭 분석이 글자와 aria-label을 싣지 않게 가린다", () => {
    setup({ maskFromAnalytics: true });

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAttribute("data-amp-mask");
    expect(dialog).toHaveAttribute("data-amp-mask-attributes", "aria-label");
  });

  it("가림을 넘기지 않으면 지금처럼 분석에 남긴다", () => {
    setup();

    expect(screen.getByRole("alertdialog")).not.toHaveAttribute("data-amp-mask");
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

  it("연 버튼이 그사이 사라지면 넘겨받은 자리로 포커스를 돌려준다", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const [opener, setOpener] = useState(true);
      return (
        <>
          <button type="button">돌아갈 자리</button>
          {opener && (
            <button type="button" onClick={() => setOpen(true)}>
              연 버튼
            </button>
          )}
          <SessionConfirmDialog
            open={open}
            title="새벽러님을 내보낼까요?"
            description="새벽러님은 3일 동안 다시 들어올 수 없어요"
            cancelLabel="취소"
            confirmLabel="내보내기"
            returnFocus={() => screen.getByRole("button", { name: "돌아갈 자리", hidden: true })}
            onCancel={() => setOpen(false)}
            onConfirm={() => {
              setOpener(false);
              setOpen(false);
            }}
          />
        </>
      );
    }
    render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "연 버튼" }));
    await userEvent.click(screen.getByRole("button", { name: "내보내기" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "돌아갈 자리" })).toHaveFocus());
  });
});
