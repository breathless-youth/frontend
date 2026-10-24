import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TimerPanel } from "../components/TimerPanel";
import { createModeState } from "../multiTimerMachine";
import type { ModeStatus } from "../multiTimerMachine";
import { DEFAULT_MULTI_TIMER_SETTINGS } from "../multiTimerSettings";

function mode(status: ModeStatus) {
  return { ...createModeState("timer", DEFAULT_MULTI_TIMER_SETTINGS), status };
}

describe("TimerPanel", () => {
  it("panel_setup_shows_wheel", () => {
    render(
      <TimerPanel
        mode={mode("setup")}
        remainingMs={1_800_000}
        distracted={false}
        onChangeTimerSec={() => {}}
      />,
    );

    expect(screen.getByRole("spinbutton", { name: "분" })).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("panel_running_shows_remaining_timer", () => {
    render(
      <TimerPanel
        mode={mode("running")}
        remainingMs={1_790_000}
        distracted={false}
        onChangeTimerSec={() => {}}
      />,
    );

    expect(screen.getByRole("timer", { name: "남은 시간" })).toHaveTextContent("00:29:50");
    expect(screen.queryByRole("spinbutton", { name: "분" })).not.toBeInTheDocument();
  });

  it("panel_done_shows_zero", () => {
    render(
      <TimerPanel
        mode={mode("done")}
        remainingMs={0}
        distracted={false}
        onChangeTimerSec={() => {}}
      />,
    );

    expect(screen.getByRole("timer")).toHaveTextContent("00:00:00");
  });
});
