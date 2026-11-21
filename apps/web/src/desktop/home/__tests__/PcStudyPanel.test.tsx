import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { PcStudyPanel } from "../PcStudyPanel";

const STATS = {
  status: "success",
  value: { studySeconds: 15512, focusSeconds: 13337, focusRate: 85.9 },
} as const;

function renderPanel(stats: Parameters<typeof PcStudyPanel>[0]["stats"] = STATS) {
  render(
    <PcStudyPanel stats={stats}>
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

  it("펼친 동안에는 제목을 화면에 보이지 않고 패널 이름으로만 읽는다", () => {
    renderPanel();

    expect(screen.getByRole("heading", { level: 2, name: "공부시간" })).toHaveClass("sr-only");
    expect(within(screen.getByRole("group", { name: /방향키/ })).queryByText("4:18:32")).toBeNull();
  });

  it("접으면 머리줄에 오늘 공부시간과 집중률이 나란히 남고 버튼이 펼치기로 바뀐다", async () => {
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "공부시간 패널 접기" }));

    const header = within(screen.getByRole("group", { name: /방향키/ }));
    expect(header.getByText("4:18:32")).toBeInTheDocument();
    expect(header.getByText("86%")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "공부 시작" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "공부시간 패널 펼치기" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("오늘 통계를 아직 모르면 접어도 시간과 집중률을 비워 둔다", async () => {
    renderPanel({ status: "pending" });

    await userEvent.click(screen.getByRole("button", { name: "공부시간 패널 접기" }));

    expect(screen.getByRole("region", { name: "공부시간" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: /방향키/ })).queryByText(/%/)).toBeNull();
  });

  it("머리줄에서 방향키로 옮긴다", () => {
    renderPanel();
    const handle = screen.getByRole("group", { name: /방향키/ });
    handle.focus();

    fireEvent.keyDown(handle, { key: "ArrowLeft" });

    expect(screen.getByRole("region", { name: "공부시간" })).toHaveStyle({ right: "40px" });
  });
});
