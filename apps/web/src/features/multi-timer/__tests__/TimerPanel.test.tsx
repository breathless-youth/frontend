import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
        soundOn
        onChangeSoundOn={() => {}}
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
        soundOn
        onChangeSoundOn={() => {}}
      />,
    );

    expect(screen.getByRole("timer", { name: "남은 시간" })).toHaveTextContent("00:29:50");
    expect(screen.queryByRole("spinbutton", { name: "분" })).not.toBeInTheDocument();
  });

  it.each(["setup", "running", "paused"] as const)(
    "%s 화면에서도 알림음 스위치로 알림음을 켠다",
    (status) => {
      const onChangeSoundOn = vi.fn();
      render(
        <TimerPanel
          mode={mode(status)}
          remainingMs={1_800_000}
          distracted={false}
          onChangeTimerSec={() => {}}
          soundOn={false}
          onChangeSoundOn={onChangeSoundOn}
        />,
      );

      const toggle = screen.getByRole("switch", { name: "알림음" });
      expect(toggle).not.toBeChecked();
      fireEvent.click(toggle);

      expect(onChangeSoundOn).toHaveBeenCalledWith(true);
    },
  );

  it("시작해서 휠이 남은 시간으로 바뀌어도 알림음 스위치는 그 자리에 그대로 남는다", () => {
    const props = {
      remainingMs: 1_800_000,
      distracted: false,
      onChangeTimerSec: () => {},
      soundOn: true,
      onChangeSoundOn: () => {},
    };
    const { rerender } = render(<TimerPanel mode={mode("setup")} {...props} />);
    const toggle = screen.getByRole("switch", { name: "알림음" });

    rerender(<TimerPanel mode={mode("running")} {...props} />);

    expect(screen.getByRole("timer")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "알림음" })).toBe(toggle);
  });
});
