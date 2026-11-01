import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { CameraOnConfirmDialog } from "../CameraOnConfirmDialog";

function setup(overrides: Partial<Parameters<typeof CameraOnConfirmDialog>[0]> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <CameraOnConfirmDialog
      open
      preview={<div data-testid="preview" />}
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onCancel, onConfirm };
}

function findDim() {
  const dim = document.querySelector<HTMLElement>('[data-state="open"]:not([role="alertdialog"])');
  if (dim === null) throw new Error("딤을 찾지 못했다");
  return dim;
}

describe("CameraOnConfirmDialog", () => {
  it("경고 다이얼로그로 노출되고 미리보기 슬롯을 그린다", () => {
    setup();

    expect(screen.getByRole("alertdialog")).toHaveAccessibleName("카메라를 켤까요?");
    expect(screen.getByTestId("preview")).toBeInTheDocument();
  });

  it("초기 포커스는 취소 버튼에 놓인다", () => {
    setup();

    expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
  });

  it("dismissable 이면 Escape 로 취소된다", async () => {
    const { onCancel } = setup();

    await userEvent.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("dismissable 이 false 면 Escape 를 무시한다", async () => {
    const { onCancel } = setup({ dismissable: false });

    await userEvent.keyboard("{Escape}");

    // 취소가 곧 하나의 선택(끄고 입장)이라 Esc 가 그것을 확정해서는 안 된다.
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("busy 면 Escape 를 무시한다", async () => {
    const { onCancel } = setup({ busy: true });

    await userEvent.keyboard("{Escape}");

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("딤을 탭해도 닫히지 않는다", async () => {
    const { onCancel } = setup();

    await userEvent.click(findDim());

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("닫으면 열기 전 포커스로 돌아간다", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            카메라 켜기 요청
          </button>
          <CameraOnConfirmDialog
            open={open}
            preview={<div data-testid="preview" />}
            onCancel={() => setOpen(false)}
            onConfirm={vi.fn()}
          />
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "카메라 켜기 요청" });

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(trigger).toHaveFocus();
  });

  it("복귀 대상이 DOM 에서 떨어졌으면 그 요소에 focus 를 부르지 않는다", async () => {
    // 트리거를 직접 만들어 detach 한 뒤 focus 를 감시한다. isConnected 검사를 지우면
    // 이 spy 가 불려 실패한다 — 요소가 사라졌다는 것만 보는 단언은 그 분기를 못 잡는다.
    const trigger = document.createElement("button");
    trigger.textContent = "카메라 켜기 요청";
    document.body.appendChild(trigger);
    trigger.focus();
    const focusSpy = vi.spyOn(trigger, "focus");

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <CameraOnConfirmDialog
          open={open}
          preview={<div data-testid="preview" />}
          onCancel={() => {
            // 확인 흐름이 트리거를 DOM 에서 떼어낸 채 닫히는 경우.
            trigger.remove();
            setOpen(false);
          }}
          onConfirm={vi.fn()}
        />
      );
    }
    render(<Harness />);
    focusSpy.mockClear();

    await userEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("두 반경 클래스가 sm 이상에서도 유지된다", () => {
    // 공용 dialog 의 sm:rounded-lg 가 base rounded-3xl 과 다른 modifier 라 640px 이상에서
    // 반경을 덮는다. sm:rounded-3xl 로 같은 modifier 를 맞춰 막는다.
    setup();

    const content = screen.getByRole("alertdialog");
    expect(content.className).toContain("sm:rounded-3xl");
    expect(content.className).not.toContain("sm:rounded-lg");
  });

  it("문구를 넘기면 제목·설명·자물쇠 줄·두 버튼을 바꾸고 초기 포커스는 취소 자리에 둔다", () => {
    setup({
      title: "카메라 위치를 확인해 주세요",
      description: "얼굴과 책상이 보이게 자리를 잡아 주세요",
      notice: "영상은 기기 밖으로 나가지 않아요",
      cancelLabel: "심플 모드로 시작",
      confirmLabel: "카메라 켜기",
    });

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("카메라 위치를 확인해 주세요");
    expect(dialog).toHaveAccessibleDescription("얼굴과 책상이 보이게 자리를 잡아 주세요");
    expect(screen.getByText("영상은 기기 밖으로 나가지 않아요")).toBeInTheDocument();
    expect(screen.queryByText("영상은 서버에 저장되지 않아요.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "심플 모드로 시작" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "카메라 켜기" })).toBeInTheDocument();
  });

  // 소셜룸 호출부가 문구를 넘기지 않으므로 기본값이 바뀌지 않게 막는다.
  it("문구를 넘기지 않으면 소셜룸 문구 그대로다", () => {
    setup();

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAccessibleDescription(
      "카메라를 켜면 순공시간 측정과 영상 공유가 시작돼요.",
    );
    expect(screen.getByText("영상은 서버에 저장되지 않아요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "카메라 켜기" })).toBeInTheDocument();
  });
});
