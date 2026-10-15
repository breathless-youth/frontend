import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MedalButton } from "../MedalButton";

describe("MedalButton", () => {
  it("메달 개수를 이름에 싣고 누르면 연다", async () => {
    const onClick = vi.fn();
    render(<MedalButton total={18} onClick={onClick} />);

    await userEvent.click(screen.getByRole("button", { name: "랭킹 기록, 메달 18개" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("요약을 아직 못 받았으면 개수 없이 그린다", () => {
    render(<MedalButton total={null} onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "랭킹 기록" }).textContent).toBe("");
  });
});
