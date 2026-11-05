import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SocialTabs } from "../SocialTabs";

describe("SocialTabs", () => {
  it("내 그룹 탭에는 그룹과 신청 수를 붙이고, 공개 그룹을 누르면 그 탭으로 바꾼다", async () => {
    const onTabChange = vi.fn();
    render(<SocialTabs tab="mine" myCountText="4/5" onTabChange={onTabChange} />);
    expect(screen.getByRole("tab", { name: "내 그룹 4/5" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "공개 그룹" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    await userEvent.setup().click(screen.getByRole("tab", { name: "공개 그룹" }));
    expect(onTabChange).toHaveBeenCalledWith("public");
  });

  it("공개 그룹을 고르면 그 탭이 고른 탭이다", () => {
    render(<SocialTabs tab="public" myCountText="4/5" onTabChange={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "공개 그룹" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "내 그룹 4/5" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });
});
