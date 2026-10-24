import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { PomodoroDial } from "../components/PomodoroDial";
import { BREAK_MIN_LIMIT, FOCUS_MIN_LIMIT } from "../multiTimerSettings";
import type { DialLimit } from "../pomodoroDialMath";

// jsdom에는 PointerEvent가 없어 좌표가 빠진 이벤트가 만들어진다.
if (typeof window.PointerEvent === "undefined") {
  window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
}

/** 340 크기로 그려진 다이얼에서 그 분 눈금이 놓인 화면 좌표 */
function pointOfMinute(minute: number): { clientX: number; clientY: number } {
  const rad = (minute * 6 * Math.PI) / 180;
  return { clientX: 170 + 100 * Math.sin(rad), clientY: 170 - 100 * Math.cos(rad) };
}

/**
 * 값을 되돌려 주는 다이얼
 *
 * 실제 패널처럼 바뀐 값을 다시 넘겨 다이얼이 따라 그려지게 한다.
 */
function ControlledDial({
  initial,
  label,
  limit,
}: {
  initial: number;
  label: string;
  limit: DialLimit;
}) {
  const [minutes, setMinutes] = useState(initial);
  return (
    <PomodoroDial
      minutes={minutes}
      tone="focus"
      interactive
      label={label}
      limit={limit}
      onChange={setMinutes}
    />
  );
}

describe("PomodoroDial", () => {
  it("slider_reports_value_and_label", () => {
    render(
      <PomodoroDial
        minutes={25}
        tone="focus"
        interactive
        label="집중 시간"
        limit={FOCUS_MIN_LIMIT}
        onChange={() => {}}
      />,
    );

    const slider = screen.getByRole("slider", { name: "집중 시간" });
    expect(slider).toHaveAttribute("aria-valuenow", "25");
    expect(slider).toHaveAttribute("aria-valuemin", "1");
    expect(slider).toHaveAttribute("aria-valuemax", "180");
    expect(slider).toHaveAttribute("aria-valuetext", "25분");
    expect(slider).toHaveAttribute("tabindex", "0");
  });

  it("arrow_keys_change_minutes", () => {
    const onChange = vi.fn();
    render(
      <PomodoroDial
        minutes={25}
        tone="focus"
        interactive
        label="집중 시간"
        limit={FOCUS_MIN_LIMIT}
        onChange={onChange}
      />,
    );
    const slider = screen.getByRole("slider", { name: "집중 시간" });

    // 값을 다시 넘기지 않으므로 키마다 25분에서 한 칸씩 움직인 값이 나온다.
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyDown(slider, { key: "ArrowUp" });
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    fireEvent.keyDown(slider, { key: "ArrowDown" });
    fireEvent.keyDown(slider, { key: "Enter" });

    expect(onChange).toHaveBeenCalledTimes(4);
    expect(onChange).toHaveBeenNthCalledWith(1, 26);
    expect(onChange).toHaveBeenNthCalledWith(2, 26);
    expect(onChange).toHaveBeenNthCalledWith(3, 24);
    expect(onChange).toHaveBeenNthCalledWith(4, 24);
  });

  it("arrow_keys_stop_at_limit", () => {
    const onChange = vi.fn();
    render(
      <PomodoroDial
        minutes={60}
        tone="break"
        interactive
        label="휴식 시간"
        limit={BREAK_MIN_LIMIT}
        onChange={onChange}
      />,
    );

    fireEvent.keyDown(screen.getByRole("slider", { name: "휴식 시간" }), { key: "ArrowRight" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("non_interactive_ignores_keys", () => {
    const onChange = vi.fn();
    render(
      <PomodoroDial
        minutes={13.75}
        tone="focus"
        interactive={false}
        label="집중 시간"
        limit={FOCUS_MIN_LIMIT}
        onChange={onChange}
      />,
    );
    const slider = screen.getByRole("slider", { name: "집중 시간" });

    fireEvent.keyDown(slider, { key: "ArrowRight" });

    expect(onChange).not.toHaveBeenCalled();
    expect(slider).toHaveAttribute("aria-disabled", "true");
    expect(slider).not.toHaveAttribute("tabindex");
    expect(slider).toHaveAttribute("aria-valuetext", "14분");
  });

  it("reported_value_stays_within_range_when_time_runs_out", () => {
    render(
      <PomodoroDial
        minutes={0}
        tone="focus"
        interactive={false}
        label="집중 시간"
        limit={FOCUS_MIN_LIMIT}
      />,
    );

    expect(screen.getByRole("slider", { name: "집중 시간" })).toHaveAttribute("aria-valuenow", "1");
  });

  it("lap_badge_after_60", () => {
    const { rerender } = render(
      <PomodoroDial
        minutes={90}
        tone="focus"
        interactive
        label="집중 시간"
        limit={FOCUS_MIN_LIMIT}
      />,
    );

    expect(screen.getByText("2바퀴째")).toBeInTheDocument();

    rerender(
      <PomodoroDial
        minutes={25}
        tone="focus"
        interactive
        label="집중 시간"
        limit={FOCUS_MIN_LIMIT}
      />,
    );

    expect(screen.queryByText(/바퀴째/)).not.toBeInTheDocument();
  });

  it("sixty_is_one_full_lap_without_badge", () => {
    render(
      <PomodoroDial
        minutes={60}
        tone="focus"
        interactive
        label="집중 시간"
        limit={FOCUS_MIN_LIMIT}
      />,
    );

    expect(screen.queryByText(/바퀴째/)).not.toBeInTheDocument();
  });

  it.each([
    ["집중 시간", FOCUS_MIN_LIMIT],
    ["휴식 시간", BREAK_MIN_LIMIT],
  ])("tap_at_half_from_sixty_sets_thirty_%s", (label, limit) => {
    const onChange = vi.fn();
    render(
      <PomodoroDial
        minutes={60}
        tone="focus"
        interactive
        label={label}
        limit={limit}
        onChange={onChange}
      />,
    );
    const slider = screen.getByRole("slider", { name: label });
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 340, height: 340 }),
    );

    fireEvent.pointerDown(slider, { pointerId: 1, ...pointOfMinute(30) });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(30);
  });

  it.each([
    { label: "집중 시간", limit: FOCUS_MIN_LIMIT, start: 50, tapped: 10 },
    { label: "집중 시간", limit: FOCUS_MIN_LIMIT, start: 60, tapped: 10 },
    { label: "휴식 시간", limit: BREAK_MIN_LIMIT, start: 50, tapped: 5 },
  ])(
    "tap_away_from_knob_stays_in_shown_lap $label $start to $tapped",
    ({ label, limit, start, tapped }) => {
      render(<ControlledDial initial={start} label={label} limit={limit} />);
      const slider = screen.getByRole("slider", { name: label });
      vi.spyOn(slider, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: 0, y: 0, width: 340, height: 340 }),
      );

      fireEvent.pointerDown(slider, { pointerId: 1, ...pointOfMinute(tapped) });
      expect(slider).toHaveAttribute("aria-valuenow", String(tapped));
      expect(screen.queryByText(/바퀴째/)).not.toBeInTheDocument();

      fireEvent.pointerMove(slider, { pointerId: 1, ...pointOfMinute(tapped + 2) });
      expect(slider).toHaveAttribute("aria-valuenow", String(tapped + 2));
      fireEvent.pointerUp(slider, { pointerId: 1 });
    },
  );

  it("drag_across_twelve_adds_lap", () => {
    const onChange = vi.fn();
    render(
      <PomodoroDial
        minutes={58}
        tone="focus"
        interactive
        label="집중 시간"
        limit={FOCUS_MIN_LIMIT}
        onChange={onChange}
      />,
    );
    const slider = screen.getByRole("slider", { name: "집중 시간" });
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 340, height: 340 }),
    );

    fireEvent.pointerDown(slider, { pointerId: 1, ...pointOfMinute(58) });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.pointerMove(slider, { pointerId: 1, ...pointOfMinute(2) });
    expect(onChange).toHaveBeenLastCalledWith(62);

    fireEvent.pointerUp(slider, { pointerId: 1 });
    fireEvent.pointerMove(slider, { pointerId: 1, ...pointOfMinute(10) });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
