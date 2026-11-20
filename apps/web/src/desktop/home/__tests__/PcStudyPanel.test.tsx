import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { PcStudyPanel } from "../PcStudyPanel";

function renderPanel(studySeconds: number | null = 15512) {
  render(
    <PcStudyPanel studySeconds={studySeconds}>
      <button type="button">공부 시작</button>
    </PcStudyPanel>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("PcStudyPanel", () => {
  it("공부시간 영역 안에 받은 내용을 그리고 옮기는 방법을 읽어 준다", () => {
    renderPanel();

    expect(screen.getByRole("region", { name: "공부시간" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "공부 시작" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /방향키/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("button", { name: "공부시간 패널 접기" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("접으면 머리줄과 오늘 공부시간만 남고 버튼이 펼치기로 바뀐다", async () => {
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "공부시간 패널 접기" }));

    expect(screen.getByRole("heading", { level: 2, name: "공부시간 4:18:32" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "공부 시작" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "공부시간 패널 펼치기" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("오늘 공부시간을 아직 모르면 접어도 제목만 보인다", async () => {
    renderPanel(null);

    await userEvent.click(screen.getByRole("button", { name: "공부시간 패널 접기" }));

    expect(screen.getByRole("heading", { level: 2, name: "공부시간" })).toBeInTheDocument();
  });

  it("머리줄에서 방향키로 옮긴다", () => {
    renderPanel();
    const handle = screen.getByRole("group", { name: /방향키/ });
    handle.focus();

    fireEvent.keyDown(handle, { key: "ArrowLeft" });

    expect(screen.getByRole("region", { name: "공부시간" })).toHaveStyle({ right: "40px" });
  });
});
