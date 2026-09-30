import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionSideActions } from "../components/SessionSideActions";

describe("SessionSideActions", () => {
  it("카메라 전환은 몸통은 고정하고 안의 화살표만 반 바퀴씩 돈다", () => {
    render(<SessionSideActions showFlip onFlipCamera={vi.fn()} ambient={null} />);
    const flip = screen.getByRole("button", { name: "카메라 전환" });
    const arrows = flip.querySelector('[data-testid="camera-flip-arrows"]') as SVGGElement;
    expect(arrows.style.transform).toBe("rotate(0deg)");

    fireEvent.click(flip);
    expect(arrows.style.transform).toBe("rotate(180deg)");

    fireEvent.click(flip);
    expect(arrows.style.transform).toBe("rotate(360deg)");
  });
});
