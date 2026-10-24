import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimerWheel } from "../components/TimerWheel";

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

  it("drag_down_two_steps_lowers_minutes_and_skips_row_click", () => {
    const onChange = vi.fn();
    render(<TimerWheel valueSec={1800} onChange={onChange} />);
    const minutes = screen.getByRole("spinbutton", { name: "분" });

    pointer(minutes, "pointerdown", 0);
    pointer(minutes, "pointermove", 92);
    pointer(minutes, "pointerup", 92);
    expect(onChange).toHaveBeenLastCalledWith(1680);

    onChange.mockClear();
    fireEvent.click(within(minutes).getByText("31"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("wheel_event_is_default_prevented", () => {
    render(<TimerWheel valueSec={1800} onChange={() => {}} />);

    const notPrevented = fireEvent.wheel(screen.getByRole("spinbutton", { name: "초" }), {
      deltaY: 10,
    });

    expect(notPrevented).toBe(false);
  });
});
