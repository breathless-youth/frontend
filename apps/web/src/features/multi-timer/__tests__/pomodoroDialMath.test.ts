import { describe, expect, it } from "vitest";

import {
  angleToMinute,
  dialFraction,
  pointToDialAngle,
  stepDialDrag,
  tapDialDrag,
} from "../pomodoroDialMath";
import { BREAK_MIN_LIMIT, FOCUS_MIN_LIMIT } from "../multiTimerSettings";

describe("dialFraction", () => {
  it("under_one_lap_is_partial_first_lap", () => {
    expect(dialFraction(25)).toEqual({ laps: 0, fraction: 25 / 60 });
  });

  it("sixty_is_full_first_lap", () => {
    expect(dialFraction(60)).toEqual({ laps: 0, fraction: 1 });
  });

  it("sixty_one_starts_second_lap", () => {
    const { laps, fraction } = dialFraction(61);
    expect(laps).toBe(1);
    expect(fraction).toBeCloseTo(1 / 60);
  });

  it("ninety_is_half_of_second_lap", () => {
    expect(dialFraction(90)).toEqual({ laps: 1, fraction: 0.5 });
  });

  it("zero_is_empty", () => {
    expect(dialFraction(0)).toEqual({ laps: 0, fraction: 0 });
  });
});

describe("angleToMinute", () => {
  it("rounds_to_nearest_six_degree_tick", () => {
    expect(angleToMinute(150)).toBe(25);
    expect(angleToMinute(152)).toBe(25);
    expect(angleToMinute(154)).toBe(26);
  });

  it("wraps_near_twelve_to_zero", () => {
    expect(angleToMinute(357)).toBe(0);
    expect(angleToMinute(0)).toBe(0);
    expect(angleToMinute(-6)).toBe(59);
  });
});

describe("pointToDialAngle", () => {
  it("measures_clockwise_from_twelve", () => {
    expect(pointToDialAngle(0, -10)).toBeCloseTo(0);
    expect(pointToDialAngle(10, 0)).toBeCloseTo(90);
    expect(pointToDialAngle(0, 10)).toBeCloseTo(180);
    expect(pointToDialAngle(-10, 0)).toBeCloseTo(270);
  });
});

describe("tapDialDrag", () => {
  it("tap_away_from_knob_stays_in_shown_lap", () => {
    expect(tapDialDrag(50, 10, FOCUS_MIN_LIMIT)).toEqual({
      drag: { laps: 0, prev: 10 },
      value: 10,
    });
    expect(tapDialDrag(60, 10, FOCUS_MIN_LIMIT)).toEqual({
      drag: { laps: 0, prev: 10 },
      value: 10,
    });
    expect(tapDialDrag(50, 5, BREAK_MIN_LIMIT)).toEqual({
      drag: { laps: 0, prev: 5 },
      value: 5,
    });
  });

  it("tap_on_later_lap_keeps_that_lap", () => {
    expect(tapDialDrag(90, 10, FOCUS_MIN_LIMIT)).toEqual({
      drag: { laps: 1, prev: 10 },
      value: 70,
    });
    expect(tapDialDrag(120, 30, FOCUS_MIN_LIMIT).value).toBe(90);
    expect(tapDialDrag(125, 50, FOCUS_MIN_LIMIT).value).toBe(170);
  });

  it("tap_at_twelve_fills_shown_lap", () => {
    expect(tapDialDrag(60, 0, FOCUS_MIN_LIMIT)).toEqual({
      drag: { laps: 0, prev: 60 },
      value: 60,
    });
    expect(tapDialDrag(60, 0, BREAK_MIN_LIMIT).value).toBe(60);
    expect(tapDialDrag(120, 0, FOCUS_MIN_LIMIT).value).toBe(120);
    expect(tapDialDrag(25, 0, FOCUS_MIN_LIMIT).value).toBe(60);
  });

  it("sixty_tapped_at_half_becomes_thirty", () => {
    expect(tapDialDrag(60, 30, FOCUS_MIN_LIMIT).value).toBe(30);
    expect(tapDialDrag(60, 30, BREAK_MIN_LIMIT).value).toBe(30);
  });

  it("drag_after_tap_counts_laps_from_tapped_minute", () => {
    const fromKnob = tapDialDrag(60, 0, FOCUS_MIN_LIMIT).drag;
    expect(stepDialDrag(fromKnob, 1, FOCUS_MIN_LIMIT).value).toBe(61);
    expect(stepDialDrag(fromKnob, 59, FOCUS_MIN_LIMIT).value).toBe(59);

    const fromTen = tapDialDrag(50, 10, FOCUS_MIN_LIMIT).drag;
    expect(stepDialDrag(fromTen, 12, FOCUS_MIN_LIMIT).value).toBe(12);
    expect(stepDialDrag(fromTen, 58, FOCUS_MIN_LIMIT).value).toBe(58);
  });
});

describe("stepDialDrag", () => {
  it("crossing_twelve_forward_adds_lap", () => {
    expect(stepDialDrag({ laps: 0, prev: 58 }, 2, FOCUS_MIN_LIMIT)).toEqual({
      drag: { laps: 1, prev: 2 },
      value: 62,
    });
  });

  it("crossing_twelve_backward_removes_lap", () => {
    expect(stepDialDrag({ laps: 1, prev: 2 }, 58, FOCUS_MIN_LIMIT)).toEqual({
      drag: { laps: 0, prev: 58 },
      value: 58,
    });
  });

  it("laps_never_go_below_zero", () => {
    expect(stepDialDrag({ laps: 0, prev: 2 }, 58, FOCUS_MIN_LIMIT)).toEqual({
      drag: { laps: 0, prev: 58 },
      value: 58,
    });
  });

  it("moving_within_a_lap_keeps_laps", () => {
    expect(stepDialDrag({ laps: 1, prev: 20 }, 30, FOCUS_MIN_LIMIT)).toEqual({
      drag: { laps: 1, prev: 30 },
      value: 90,
    });
  });

  it("break_value_stops_at_sixty", () => {
    expect(stepDialDrag({ laps: 0, prev: 58 }, 5, BREAK_MIN_LIMIT)).toEqual({
      drag: { laps: 1, prev: 5 },
      value: 60,
    });
  });

  it("spinning_past_limit_does_not_pile_up_laps", () => {
    const over = stepDialDrag({ laps: 1, prev: 58 }, 2, BREAK_MIN_LIMIT);
    expect(over).toEqual({ drag: { laps: 1, prev: 2 }, value: 60 });

    expect(stepDialDrag(over.drag, 58, BREAK_MIN_LIMIT).value).toBe(58);
  });

  it("zero_becomes_minimum", () => {
    expect(stepDialDrag({ laps: 0, prev: 3 }, 0, FOCUS_MIN_LIMIT)).toEqual({
      drag: { laps: 0, prev: 0 },
      value: 1,
    });
  });

  it("full_turn_from_below_is_sixty", () => {
    expect(stepDialDrag({ laps: 0, prev: 58 }, 0, FOCUS_MIN_LIMIT)).toEqual({
      drag: { laps: 1, prev: 0 },
      value: 60,
    });
  });
});
