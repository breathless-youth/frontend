import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionRecoveryDialog } from "../SessionRecoveryDialog";

/** 2026-08-27은 목요일. 시각은 UTC라 KST(+9)로 21:03과 22:48이 된다. */
const RECOVERED = {
  statDate: "2026-08-27",
  startedAt: "2026-08-27T12:03:00Z",
  endedAt: "2026-08-27T13:48:00Z",
  studySec: 6300,
  focusSec: 5040,
};

function renderDialog(onConfirm = vi.fn()) {
  render(<SessionRecoveryDialog recovered={RECOVERED} onConfirm={onConfirm} />);
  return onConfirm;
}

describe("SessionRecoveryDialog", () => {
  it("제목과 설명, 확인 버튼을 가진 다이얼로그다", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("저장되지 않은 기록을 복구했어요")).toBeInTheDocument();
    expect(screen.getByText(/앱이 예기치 않게 종료되었어요/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "확인" })).toBeInTheDocument();
  });

  it("날짜를 요일과 함께 보여준다", () => {
    renderDialog();

    expect(screen.getByText("8월 27일 (목)")).toBeInTheDocument();
  });

  it("시작과 종료를 한국 시각으로 보여준다", () => {
    renderDialog();

    expect(screen.getByText("21:03 ~ 22:48")).toBeInTheDocument();
  });

  it("총 공부시간과 순공시간을 길이 표기로 보여준다", () => {
    renderDialog();

    expect(screen.getByText("1시간 45분")).toBeInTheDocument();
    expect(screen.getByText("1시간 24분")).toBeInTheDocument();
  });

  it("확인을 누르면 onConfirm이 불린다", () => {
    const onConfirm = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
