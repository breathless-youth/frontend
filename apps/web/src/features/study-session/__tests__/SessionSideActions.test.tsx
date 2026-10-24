import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionSideActions } from "../components/SessionSideActions";

describe("SessionSideActions", () => {
  it("카메라 전환은 몸통은 고정하고 안의 화살표만 반 바퀴씩 돈다", () => {
    render(<SessionSideActions onFlipCamera={vi.fn()} ambient={null} subject={null} />);
    const flip = screen.getByRole("button", { name: "카메라 전환" });
    const arrows = flip.querySelector('[data-testid="camera-flip-arrows"]') as SVGGElement;
    expect(arrows.style.transform).toBe("rotate(0deg)");

    fireEvent.click(flip);
    expect(arrows.style.transform).toBe("rotate(180deg)");

    fireEvent.click(flip);
    expect(arrows.style.transform).toBe("rotate(360deg)");
  });

  it("모드 버튼은 기존 세 버튼 뒤에 순서대로 놓인다", () => {
    render(
      <SessionSideActions
        onFlipCamera={vi.fn()}
        ambient={<button type="button" aria-label="배경음" />}
        subject={<button type="button" aria-label="과목" />}
        modes={
          <>
            <button type="button" aria-label="타이머" />
            <button type="button" aria-label="뽀모도로" />
          </>
        }
      />,
    );

    const names = within(screen.getByRole("group", { name: "부가 기능" }))
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["카메라 전환", "배경음", "과목", "타이머", "뽀모도로"]);
  });
});
