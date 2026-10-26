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

  it("열 사이 쌍점 없이 단위를 각 열 안에 한 번만 둔다", () => {
    render(<TimerWheel valueSec={1800} onChange={() => {}} />);

    expect(screen.queryByText(":")).toBeNull();
    for (const unit of ["시간", "분", "초"]) {
      expect(screen.getAllByText(unit)).toHaveLength(1);
      expect(
        within(screen.getByRole("spinbutton", { name: unit })).getByText(unit),
      ).toBeInTheDocument();
    }
  });

  it("arrow_up_on_minutes_adds_minute", () => {
    const onChange = vi.fn();
    render(<TimerWheel valueSec={1800} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "분" }), { key: "ArrowUp" });

    expect(onChange).toHaveBeenCalledWith(1860);
  });

  it("0시간에서 아래 화살표를 눌러도 23시간으로 넘어가지 않는다", () => {
    const onChange = vi.fn();
    render(<TimerWheel valueSec={1800} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "시간" }), { key: "ArrowDown" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("끝에서 위 화살표는 멈추고 Home과 End는 양 끝으로 간다", () => {
    const onChange = vi.fn();
    render(<TimerWheel valueSec={23 * 3600 + 1800} onChange={onChange} />);
    const hours = screen.getByRole("spinbutton", { name: "시간" });

    fireEvent.keyDown(hours, { key: "ArrowUp" });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(hours, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(1800);

    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "분" }), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(23 * 3600 + 59 * 60);
  });

  it("범위 밖 줄은 숫자 없이 비워 둔다", () => {
    render(<TimerWheel valueSec={59} onChange={() => {}} />);
    const hours = screen.getByRole("spinbutton", { name: "시간" });
    const seconds = screen.getByRole("spinbutton", { name: "초" });

    expect(within(hours).getByText("01")).toBeInTheDocument();
    expect(within(hours).queryByText("23")).toBeNull();
    expect(within(hours).queryByText("22")).toBeNull();
    expect(within(seconds).getByText("58")).toBeInTheDocument();
    expect(within(seconds).queryByText("00")).toBeNull();
    expect(within(seconds).queryByText("01")).toBeNull();
  });

  it("끝을 넘겨 끌어도 끝 값에 머물고 햅틱을 내지 않는다", () => {
    stubReducedMotion(false);
    const onChange = vi.fn();
    render(<TimerWheel valueSec={0} onChange={onChange} />);
    const hours = screen.getByRole("spinbutton", { name: "시간" });

    pointerAt(hours, "pointerdown", 0, 0);
    pointerAt(hours, "pointermove", 138, 400);
    pointerAt(hours, "pointerup", 138, 1000);

    expect(onChange).not.toHaveBeenCalled();
    expect(haptic).not.toHaveBeenCalled();
    expect(hours).toHaveAttribute("aria-valuenow", "0");
  });

  it("끝을 넘겨 끄는 동안 저항을 받아 손가락보다 덜 따라온다", () => {
    stubReducedMotion(false);
    render(<TimerWheel valueSec={0} onChange={() => {}} />);
    const hours = screen.getByRole("spinbutton", { name: "시간" });

    pointerAt(hours, "pointerdown", 0, 0);
    pointerAt(hours, "pointermove", 92, 400);

    // 두 칸을 그대로 따라왔다면 0은 가운데에서 두 칸 떨어져 20%로 흐려진다.
    const opacity = Number.parseFloat(within(hours).getByText("00").style.opacity);
    expect(opacity).toBeGreaterThan(0.2);
    expect(opacity).toBeLessThan(1);
  });

  it("모션 줄이기에서는 끝을 넘겨 끌어도 넘어가지 않는다", () => {
    stubReducedMotion(true);
    render(<TimerWheel valueSec={0} onChange={() => {}} />);
    const hours = screen.getByRole("spinbutton", { name: "시간" });

    pointerAt(hours, "pointerdown", 0, 0);
    pointerAt(hours, "pointermove", 92, 400);

    expect(within(hours).getByText("00").style.opacity).toBe("1");
  });

  it("끝을 넘겨 끈 뒤 돌아오는 중에도 키 입력이 끝 값에서부터 먹는다", () => {
    stubReducedMotion(false);
    // 돌아오는 애니메이션을 첫 프레임 전에 세워 둔다.
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const onChange = vi.fn();
    render(<TimerWheel valueSec={0} onChange={onChange} />);
    const hours = screen.getByRole("spinbutton", { name: "시간" });

    pointerAt(hours, "pointerdown", 0, 0);
    pointerAt(hours, "pointermove", 138, 400);
    pointerAt(hours, "pointerup", 138, 1000);
    fireEvent.keyDown(hours, { key: "ArrowUp" });

    expect(onChange).toHaveBeenLastCalledWith(3600);
  });

  it("끝을 넘겨 끈 뒤 돌아오는 중에도 End는 마지막 값으로 간다", () => {
    stubReducedMotion(false);
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const onChange = vi.fn();
    render(<TimerWheel valueSec={0} onChange={onChange} />);
    const hours = screen.getByRole("spinbutton", { name: "시간" });

    pointerAt(hours, "pointerdown", 0, 0);
    pointerAt(hours, "pointermove", 138, 400);
    pointerAt(hours, "pointerup", 138, 1000);
    fireEvent.keyDown(hours, { key: "End" });

    expect(onChange).toHaveBeenLastCalledWith(23 * 3600);
  });

  it("끝 너머로 튕겨도 끝 값에서 멈춘다", () => {
    stubReducedMotion(false);
    const onChange = vi.fn();
    render(<TimerWheel valueSec={57 * 60} onChange={onChange} />);
    const minutes = screen.getByRole("spinbutton", { name: "분" });

    pointerAt(minutes, "pointerdown", 0, 0);
    pointerAt(minutes, "pointermove", -46, 20);
    pointerAt(minutes, "pointermove", -92, 40);
    pointerAt(minutes, "pointerup", -92, 45);

    expect(onChange).toHaveBeenLastCalledWith(59 * 60);
    for (const [sec] of onChange.mock.calls) expect(sec).toBeGreaterThanOrEqual(57 * 60);
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
    render(<TimerWheel valueSec={1830} onChange={onChange} />);
    const seconds = screen.getByRole("spinbutton", { name: "초" });

    fireEvent.wheel(seconds, { deltaY: 40 });
    fireEvent.wheel(seconds, { deltaY: -46 });

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(1829);
  });

  it("끝에서 휠과 트랙패드로 더 넘겨도 값과 햅틱이 그대로다", () => {
    const onChange = vi.fn();
    render(<TimerWheel valueSec={59} onChange={onChange} />);
    const seconds = screen.getByRole("spinbutton", { name: "초" });

    fireEvent.wheel(seconds, { deltaY: 100 });
    for (let i = 0; i < 10; i += 1) fireEvent.wheel(seconds, { deltaY: 5 });

    expect(onChange).not.toHaveBeenCalled();
    expect(haptic).not.toHaveBeenCalled();
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
