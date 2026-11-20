import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { SessionResumeDialog } from "../SessionResumeDialog";

const analytics = vi.hoisted(() => ({ prompted: vi.fn(), answered: vi.fn() }));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackStudySessionResumePrompted: analytics.prompted,
  trackStudySessionResumeAnswered: analytics.answered,
}));

afterEach(() => {
  vi.clearAllMocks();
});

function renderDialog(
  overrides: Partial<{ onResume: () => Promise<void>; onEnd: () => Promise<void> }> = {},
) {
  const props = {
    awayMin: 32,
    place: "room" as const,
    onResume: vi.fn(async () => {}),
    onEnd: vi.fn(async () => {}),
    ...overrides,
  };
  render(<SessionResumeDialog {...props} />);
  return props;
}

describe("SessionResumeDialog", () => {
  it("제목과 앱 밖에 있던 분을 넣은 본문, 두 버튼을 보여 준다", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "공부를 이어 갈까요?" })).toBeInTheDocument();
    expect(screen.getByText("앱 밖에 있던 32분도 공부 시간에 들어가요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이어서 공부하기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "나간 시점에서 끝내기" })).toBeInTheDocument();
  });

  it("ESC를 눌러도 닫히지 않고 아무 답도 고르지 않는다", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(props.onResume).not.toHaveBeenCalled();
    expect(props.onEnd).not.toHaveBeenCalled();
  });

  it("이어서 공부하기를 누르면 응답을 남기고 요청이 끝날 때까지 두 버튼을 막는다", async () => {
    const props = renderDialog({ onResume: vi.fn(() => new Promise<void>(() => {})) });

    await userEvent.click(screen.getByRole("button", { name: "이어서 공부하기" }));

    expect(props.onResume).toHaveBeenCalledTimes(1);
    expect(analytics.answered).toHaveBeenCalledWith({ choice: "resume", place: "room" });
    expect(screen.getByRole("button", { name: "이어서 공부하기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "나간 시점에서 끝내기" })).toBeDisabled();
  });

  it("고른 요청이 실패하면 두 버튼을 다시 연다", async () => {
    renderDialog({ onResume: vi.fn(() => Promise.reject(new Error("not delivered"))) });

    await userEvent.click(screen.getByRole("button", { name: "이어서 공부하기" }));

    expect(screen.getByRole("button", { name: "이어서 공부하기" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "나간 시점에서 끝내기" })).toBeEnabled();
  });

  it("나간 시점에서 끝내기를 누르면 끝내기 응답을 남긴다", async () => {
    const props = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "나간 시점에서 끝내기" }));

    expect(props.onEnd).toHaveBeenCalledTimes(1);
    expect(props.onResume).not.toHaveBeenCalled();
    expect(analytics.answered).toHaveBeenCalledWith({ choice: "end", place: "room" });
  });

  it("뜰 때 노출을 StrictMode에서도 한 번만 남긴다", () => {
    render(
      <StrictMode>
        <SessionResumeDialog awayMin={32} place="home" onResume={vi.fn()} onEnd={vi.fn()} />
      </StrictMode>,
    );

    expect(analytics.prompted).toHaveBeenCalledTimes(1);
    expect(analytics.prompted).toHaveBeenCalledWith({ awayMin: 32, place: "home" });
  });
});
