import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ForceUpdateDialog } from "../ForceUpdateDialog";

const TITLE = "업데이트가 필요해요";
const DESCRIPTION = "원활한 이용을 위해 최신 버전으로 업데이트해 주세요.";
const CONFIRM_LABEL = "지금 업데이트";

function renderDialog(overrides: { onConfirm?: () => void } = {}) {
  const onConfirm = overrides.onConfirm ?? vi.fn();
  render(
    <ForceUpdateDialog
      title={TITLE}
      description={DESCRIPTION}
      confirmLabel={CONFIRM_LABEL}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe("ForceUpdateDialog", () => {
  it("제목·본문·확인 버튼 라벨을 렌더한다", () => {
    renderDialog();

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: CONFIRM_LABEL })).toBeInTheDocument();
  });

  it("role=alertdialog이고 제목·본문이 aria-labelledby/aria-describedby로 연결된다", () => {
    renderDialog();

    const dialog = screen.getByRole("alertdialog");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    const describedBy = dialog.getAttribute("aria-describedby");

    expect(labelledBy).toBeTruthy();
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent(TITLE);
    expect(document.getElementById(describedBy!)).toHaveTextContent(DESCRIPTION);
  });

  it("닫기(X) 버튼을 렌더하지 않는다 — 확인 버튼 하나뿐이다", () => {
    renderDialog();

    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("Escape를 눌러도 닫히지 않고 onConfirm도 불리지 않는다", () => {
    const onConfirm = renderDialog();

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("바깥(오버레이)을 클릭해도 닫히지 않고 onConfirm도 불리지 않는다", () => {
    const onConfirm = renderDialog();

    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("확인 버튼을 누르면 onConfirm이 호출된다", () => {
    const onConfirm = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: CONFIRM_LABEL }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
