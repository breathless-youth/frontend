import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TimerWheel } from "../components/TimerWheel";
import { __resetFrameIntervalsForTests, recordFrameInterval } from "../wheelMotion";

const haptic = vi.hoisted(() => vi.fn());
vi.mock("@/lib/haptics", () => ({ haptic }));

let nowMs = 0;
beforeEach(() => {
  haptic.mockReset();
  nowMs = 0;
  vi.spyOn(performance, "now").mockImplementation(() => nowMs);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  __resetFrameIntervalsForTests();
});

/** 손가락이 움직인 시각을 정해 두고 끌기 이벤트를 쏜다. */
function pointerAt(target: HTMLElement, type: string, clientY: number, atMs: number) {
  nowMs = atMs;
  pointer(target, type, clientY);
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: reduce && query.includes("reduce"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

/** jsdom의 PointerEvent는 clientY를 싣지 못해 MouseEvent로 같은 이름의 이벤트를 쏜다. */
function pointer(target: HTMLElement, type: string, clientY: number) {
  fireEvent(target, new MouseEvent(type, { bubbles: true, clientY }));
}

describe("TimerWheel", () => {
  it("wheel_renders_three_spinbuttons_with_values", () => {
    render(<TimerWheel valueSec={1800} onChange={() => {}} />);

    const hours = screen.getByRole("spinbutton", { name: "시간" });
    const minutes = screen.getByRole("spinbutton", { name: "분" });
    const seconds = screen.getByRole("spinbutton", { name: "초" });
    expect(hours).toHaveAttribute("aria-valuenow", "0");
    expect(hours).toHaveAttribute("aria-valuemax", "23");
    expect(hours).toHaveAttribute("aria-valuetext", "0시간");
    expect(minutes).toHaveAttribute("aria-valuenow", "30");
    expect(minutes).toHaveAttribute("aria-valuemax", "59");
    expect(minutes).toHaveAttribute("aria-valuetext", "30분");
    expect(seconds).toHaveAttribute("aria-valuenow", "0");
    expect(seconds).toHaveAttribute("aria-valuetext", "0초");
  });

  it("arrow_up_on_minutes_adds_minute", () => {
    const onChange = vi.fn();
    render(<TimerWheel valueSec={1800} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "분" }), { key: "ArrowUp" });

    expect(onChange).toHaveBeenCalledWith(1860);
  });

  it("arrow_down_on_hours_wraps_to_23", () => {
    const onChange = vi.fn();
    render(<TimerWheel valueSec={1800} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "시간" }), { key: "ArrowDown" });

    expect(onChange).toHaveBeenCalledWith(23 * 3600 + 1800);
  });

  it("clicking_row_below_selects_it", () => {
    const onChange = vi.fn();
    render(<TimerWheel valueSec={1800} onChange={onChange} />);

    fireEvent.click(within(screen.getByRole("spinbutton", { name: "분" })).getByText("31"));

    expect(onChange).toHaveBeenCalledWith(1860);
  });

  it("wheel_notch_steps_seconds_once", () => {
    const onChange = vi.fn();
    render(<TimerWheel valueSec={1800} onChange={onChange} />);
    const seconds = screen.getByRole("spinbutton", { name: "초" });

    fireEvent.wheel(seconds, { deltaY: 100 });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(1801);

    onChange.mockClear();
    fireEvent.wheel(seconds, { deltaY: 3, deltaMode: 1 });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(1801);
  });

  it("trackpad_scroll_steps_once_per_row_height", () => {
    const onChange = vi.fn();
    render(<TimerWheel valueSec={1800} onChange={onChange} />);
    const seconds = screen.getByRole("spinbutton", { name: "초" });

    for (let i = 0; i < 9; i += 1) fireEvent.wheel(seconds, { deltaY: 5 });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.wheel(seconds, { deltaY: 5 });
    expect(onChange).toHaveBeenCalledOnce();

    for (let i = 0; i < 10; i += 1) fireEvent.wheel(seconds, { deltaY: 5 });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("reversing_trackpad_drops_partial_scroll", () => {
    const onChange = vi.fn();
    render(<TimerWheel valueSec={1800} onChange={onChange} />);
    const seconds = screen.getByRole("spinbutton", { name: "초" });

    fireEvent.wheel(seconds, { deltaY: 40 });
    fireEvent.wheel(seconds, { deltaY: -46 });

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(1859);
  });

  it("shows_two_rows_above_and_below", () => {
    render(<TimerWheel valueSec={1800} onChange={() => {}} />);
    const minutes = screen.getByRole("spinbutton", { name: "분" });

    for (const shown of ["28", "29", "30", "31", "32"]) {
      expect(within(minutes).getByText(shown)).toBeInTheDocument();
    }
    expect(within(minutes).queryByText("27")).toBeNull();
    expect(within(minutes).queryByText("33")).toBeNull();
  });

  it("drag_follows_finger_and_changes_value_past_half_row", () => {
    const onChange = vi.fn();
    render(<TimerWheel valueSec={1800} onChange={onChange} />);
    const minutes = screen.getByRole("spinbutton", { name: "분" });

    pointerAt(minutes, "pointerdown", 0, 0);
    pointerAt(minutes, "pointermove", 20, 200);
    expect(onChange).not.toHaveBeenCalled();

    pointerAt(minutes, "pointermove", 30, 400);
    expect(onChange).toHaveBeenLastCalledWith(1740);
  });

  it("drag_ticks_light_haptic_per_row", () => {
    render(<TimerWheel valueSec={1800} onChange={() => {}} />);
    const minutes = screen.getByRole("spinbutton", { name: "분" });

    pointerAt(minutes, "pointerdown", 0, 0);
    pointerAt(minutes, "pointermove", 10, 200);
    expect(haptic).not.toHaveBeenCalled();
    pointerAt(minutes, "pointermove", 46, 400);
    pointerAt(minutes, "pointermove", 92, 600);

    expect(haptic).toHaveBeenCalledTimes(2);
    expect(haptic).toHaveBeenCalledWith("light");
  });

  it("slow_release_stays_on_dragged_value_and_skips_row_click", () => {
    const onChange = vi.fn();
    render(<TimerWheel valueSec={1800} onChange={onChange} />);
    const minutes = screen.getByRole("spinbutton", { name: "분" });

    pointerAt(minutes, "pointerdown", 0, 0);
    pointerAt(minutes, "pointermove", 92, 400);
    pointerAt(minutes, "pointerup", 92, 1000);
    expect(onChange).toHaveBeenLastCalledWith(1680);

    onChange.mockClear();
    fireEvent.click(within(minutes).getByText("31"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("fast_flick_rolls_past_the_finger", () => {
    stubReducedMotion(false);
    const onChange = vi.fn();
    render(<TimerWheel valueSec={1800} onChange={onChange} />);
    const minutes = screen.getByRole("spinbutton", { name: "분" });

    pointerAt(minutes, "pointerdown", 0, 0);
    pointerAt(minutes, "pointermove", 46, 20);
    pointerAt(minutes, "pointermove", 92, 40);
    pointerAt(minutes, "pointerup", 92, 45);

    const lastSec = onChange.mock.lastCall?.[0] as number;
    expect(lastSec).toBeLessThan(1680);
  });

  it("low_frame_rate_flick_rolls_less_than_smooth_flick", () => {
    stubReducedMotion(false);
    for (let i = 0; i < 10; i += 1) recordFrameInterval(33.3);
    const onChange = vi.fn();
    render(<TimerWheel valueSec={1800} onChange={onChange} />);
    const minutes = screen.getByRole("spinbutton", { name: "분" });

    pointerAt(minutes, "pointerdown", 0, 0);
    pointerAt(minutes, "pointermove", 46, 20);
    pointerAt(minutes, "pointermove", 92, 40);
    pointerAt(minutes, "pointerup", 92, 45);

    const lastSec = onChange.mock.lastCall?.[0] as number;
    expect(lastSec).toBeLessThan(1680);
    expect(lastSec).toBeGreaterThanOrEqual(25 * 60);
  });

  it("reduced_motion_flick_stops_where_the_finger_left", () => {
    stubReducedMotion(true);
    const onChange = vi.fn();
    render(<TimerWheel valueSec={1800} onChange={onChange} />);
    const minutes = screen.getByRole("spinbutton", { name: "분" });

    pointerAt(minutes, "pointerdown", 0, 0);
    pointerAt(minutes, "pointermove", 46, 20);
    pointerAt(minutes, "pointermove", 92, 40);
    pointerAt(minutes, "pointerup", 92, 45);

    expect(onChange).toHaveBeenLastCalledWith(1680);
  });

  it("wheel_and_tap_tick_haptic_but_keyboard_does_not", () => {
    render(<TimerWheel valueSec={1800} onChange={() => {}} />);
    const seconds = screen.getByRole("spinbutton", { name: "초" });

    fireEvent.keyDown(seconds, { key: "ArrowUp" });
    expect(haptic).not.toHaveBeenCalled();

    fireEvent.wheel(seconds, { deltaY: 100 });
    expect(haptic).toHaveBeenCalledTimes(1);

    fireEvent.click(within(seconds).getByText("01"));
    expect(haptic).toHaveBeenCalledTimes(2);
    expect(haptic).toHaveBeenCalledWith("light");
  });

  it("wheel_event_is_default_prevented", () => {
    render(<TimerWheel valueSec={1800} onChange={() => {}} />);

    const notPrevented = fireEvent.wheel(screen.getByRole("spinbutton", { name: "초" }), {
      deltaY: 10,
    });

    expect(notPrevented).toBe(false);
  });
});
