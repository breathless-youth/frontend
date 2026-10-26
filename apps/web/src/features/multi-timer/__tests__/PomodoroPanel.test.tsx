import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
  const onChangeSoundOn = vi.fn();
  render(
    <PomodoroPanel
      remainingMs={props.mode.clock.remainingMs}
      distracted={false}
      onChangeSettings={onChangeSettings}
      soundOn
      onChangeSoundOn={onChangeSoundOn}
      {...props}
    />,
  );
  return { onChangeSettings, onChangeSoundOn };
}

describe("PomodoroPanel", () => {
  it.each(["setup", "running", "paused"] as const)(
    "%s 화면에서도 알림음 스위치로 알림음을 끈다",
    (status) => {
      const { onChangeSoundOn } = renderPanel({ mode: mode(status) });

      const toggle = screen.getByRole("switch", { name: "알림음" });
      expect(toggle).toBeChecked();
      fireEvent.click(toggle);

      expect(onChangeSoundOn).toHaveBeenCalledWith(false);
    },
  );

  it("알림음이 꺼져 있으면 스위치도 꺼져 있다", () => {
    renderPanel({ mode: mode("setup"), soundOn: false });

    expect(screen.getByRole("switch", { name: "알림음" })).not.toBeChecked();
  });

  it("setup_shows_cards_and_focus_time", () => {
    renderPanel({ mode: mode("setup") });

    expect(screen.getByRole("combobox", { name: "집중 시간" })).toHaveValue("25");
    expect(screen.getByRole("combobox", { name: "휴식 시간" })).toHaveValue("5");
    expect(screen.getByRole("timer", { name: "집중 시간" })).toHaveTextContent("25:00");
    expect(screen.getByRole("slider", { name: "집중 시간" })).toHaveAttribute(
      "aria-valuenow",
      "25",
    );
  });

  it.each([
    ["집중 시간", 180],
    ["휴식 시간", 60],
  ] as const)("%s 선택지는 5분부터 %i분까지 5분 단위다", (name, max) => {
    renderPanel({ mode: mode("setup") });

    const options = within(screen.getByRole("combobox", { name })).getAllByRole("option");
    expect(options).toHaveLength(max / 5);
    expect(options[0]).toHaveTextContent("5분");
    expect(options[0]).toHaveValue("5");
    expect(options[1]).toHaveValue("10");
    expect(options.at(-1)).toHaveTextContent(`${max}분`);
  });

  it("5분 단위가 아닌 지금 값은 선택지에 끼워 넣어 그 값을 가리킨다", () => {
    const base = mode("setup");
    renderPanel({ mode: { ...base, settings: { ...base.settings, focusMin: 23 } } });

    const select = screen.getByRole("combobox", { name: "집중 시간" });
    expect(select).toHaveValue("23");
    const values = within(select)
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(values.slice(3, 6)).toEqual(["20", "23", "25"]);
  });

  it("5분보다 작은 지금 값은 선택지 맨 앞에 끼워 넣는다", () => {
    const base = mode("setup");
    renderPanel({ mode: { ...base, settings: { ...base.settings, breakMin: 1 } } });

    const select = screen.getByRole("combobox", { name: "휴식 시간" });
    expect(select).toHaveValue("1");
    const values = within(select)
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(values.slice(0, 2)).toEqual(["1", "5"]);
  });

  it("focus_select_change_patches_focus_minutes", () => {
    const { onChangeSettings } = renderPanel({ mode: mode("setup") });

    fireEvent.change(screen.getByRole("combobox", { name: "집중 시간" }), {
      target: { value: "45" },
    });

    expect(onChangeSettings).toHaveBeenCalledWith({ focusMin: 45 });
  });

  it("break_select_change_patches_break_and_shows_break_on_dial", () => {
    const { onChangeSettings } = renderPanel({ mode: mode("setup") });

    fireEvent.change(screen.getByRole("combobox", { name: "휴식 시간" }), {
      target: { value: "10" },
    });

    expect(onChangeSettings).toHaveBeenCalledWith({ breakMin: 10 });
    const slider = screen.getByRole("slider", { name: "휴식 시간" });
    expect(slider).toHaveAttribute("aria-valuemax", "60");
    // 위 시간은 고른 칸과 상관없이 집중 시간이다.
    expect(screen.getByRole("timer", { name: "집중 시간" })).toHaveTextContent("25:00");
  });

  it("focusing_break_select_shows_break_minutes_on_dial", () => {
    renderPanel({ mode: mode("setup") });

    fireEvent.focus(screen.getByRole("combobox", { name: "휴식 시간" }));

    expect(screen.getByRole("slider", { name: "휴식 시간" })).toHaveAttribute("aria-valuenow", "5");
  });

  it("dial_keys_patch_focus_minutes", () => {
    const { onChangeSettings } = renderPanel({ mode: mode("setup") });

    fireEvent.keyDown(screen.getByRole("slider", { name: "집중 시간" }), { key: "ArrowRight" });

    expect(onChangeSettings).toHaveBeenCalledWith({ focusMin: 26 });
  });

  it("running_hides_cards", () => {
    renderPanel({ mode: mode("running"), remainingMs: 825_000 });

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
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
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
