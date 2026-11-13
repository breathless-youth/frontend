import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionCountdown } from "../SessionCountdown";

describe("SessionCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("화면이 가려진 동안에는 세지 않는다", () => {
    const onDone = vi.fn();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<SessionCountdown seconds={3} onDone={onDone} />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDone).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
