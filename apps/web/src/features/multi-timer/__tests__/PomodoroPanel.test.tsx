import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { PomodoroPanel } from "../components/PomodoroPanel";
import { createModeState } from "../multiTimerMachine";
import type { ModeStatus, PomodoroPhase } from "../multiTimerMachine";
import { DEFAULT_MULTI_TIMER_SETTINGS } from "../multiTimerSettings";

function mode(status: ModeStatus, phase: PomodoroPhase = "focus") {
  return { ...createModeState("pomodoro", DEFAULT_MULTI_TIMER_SETTINGS), status, phase };
}

function renderPanel(
  props: Partial<Parameters<typeof PomodoroPanel>[0]> & { mode: ReturnType<typeof mode> },
) {
  const onChangeSettings = vi.fn();
  render(
    <PomodoroPanel
      remainingMs={props.mode.clock.remainingMs}
      distracted={false}
      container={null}
      onChangeSettings={onChangeSettings}
      {...props}
    />,
  );
  return { onChangeSettings };
}

// 키패드 시트는 나눠 받는다. 첫 열기에서 모듈 받기가 findBy 기본 대기를 넘지 않게 미리 받아 둔다.
beforeAll(async () => {
  await import("../components/MinuteKeypadSheet");
});

describe("PomodoroPanel", () => {
  it("setup_shows_cards_and_focus_time", () => {
    renderPanel({ mode: mode("setup") });

    expect(screen.getByRole("button", { name: "집중 25분" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "휴식 5분" })).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "집중 시간" })).toHaveTextContent("25:00");
    expect(screen.getByRole("slider", { name: "집중 시간" })).toHaveAttribute(
      "aria-valuenow",
      "25",
    );
  });

  it("card_press_opens_keypad_for_that_kind", async () => {
    renderPanel({ mode: mode("setup") });

    fireEvent.click(screen.getByRole("button", { name: "휴식 5분" }));

    expect(await screen.findByRole("dialog", { name: "휴식 시간" })).toBeInTheDocument();
    expect(screen.getByText("1–60분")).toBeInTheDocument();
  });

  it("selecting_break_shows_break_minutes_on_dial", async () => {
    renderPanel({ mode: mode("setup") });

    fireEvent.click(screen.getByRole("button", { name: "휴식 5분" }));
    fireEvent.click(await screen.findByRole("button", { name: "확인" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    const slider = screen.getByRole("slider", { name: "휴식 시간" });
    expect(slider).toHaveAttribute("aria-valuenow", "5");
    expect(slider).toHaveAttribute("aria-valuemax", "60");
    // 위 시간은 고른 칸과 상관없이 집중 시간이다.
    expect(screen.getByRole("timer", { name: "집중 시간" })).toHaveTextContent("25:00");
  });

  it("keypad_apply_patches_selected_kind", async () => {
    const { onChangeSettings } = renderPanel({ mode: mode("setup") });

    fireEvent.click(screen.getByRole("button", { name: "집중 25분" }));
    fireEvent.click(await screen.findByRole("button", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    expect(onChangeSettings).toHaveBeenCalledWith({ focusMin: 45 });
  });

  it("dial_keys_patch_focus_minutes", () => {
    const { onChangeSettings } = renderPanel({ mode: mode("setup") });

    fireEvent.keyDown(screen.getByRole("slider", { name: "집중 시간" }), { key: "ArrowRight" });

    expect(onChangeSettings).toHaveBeenCalledWith({ focusMin: 26 });
  });

  it("running_hides_cards", () => {
    renderPanel({ mode: mode("running"), remainingMs: 825_000 });

    expect(screen.queryByRole("button", { name: /집중/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /휴식/ })).not.toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "집중 시간" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("running_shows_remaining", () => {
    renderPanel({ mode: mode("running"), remainingMs: 825_000 });

    expect(screen.getByRole("timer", { name: "남은 시간" })).toHaveTextContent("13:45");
  });

  it("running_over_an_hour_shows_lap_badge", () => {
    renderPanel({ mode: mode("running"), remainingMs: 90 * 60_000 });

    expect(screen.getByText("2바퀴째")).toBeInTheDocument();
  });

  it("break_phase_time", () => {
    renderPanel({ mode: mode("running", "break"), remainingMs: 240_000 });

    expect(screen.getByRole("timer", { name: "남은 시간" })).toHaveTextContent("04:00");
    expect(screen.getByRole("slider", { name: "휴식 시간" })).toBeInTheDocument();
  });

  it("paused_shows_remaining_without_cards", () => {
    renderPanel({ mode: mode("paused"), remainingMs: 600_000 });

    expect(screen.getByRole("timer", { name: "남은 시간" })).toHaveTextContent("10:00");
    expect(screen.queryByRole("button", { name: /집중/ })).not.toBeInTheDocument();
  });
});
