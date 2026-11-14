import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WallpaperScrim } from "../WallpaperScrim";

/** 모드별 띠 묶음. 두 묶음이 겹쳐 있고 보이는 쪽만 불투명하다. */
const layer = (variant: "default" | "simple") => {
  const group = screen.getByTestId("wallpaper-scrim").querySelector(`[data-scrim="${variant}"]`)!;
  const [top, bottom] = Array.from(group.children);
  return { group, top, bottom };
};

describe("WallpaperScrim", () => {
  it("기본 모드는 위 140px·아래 320px 띠를 보이고 심플 띠는 숨긴다", () => {
    render(<WallpaperScrim simple={false} />);

    expect(layer("default").group).toHaveClass("opacity-100");
    expect(layer("simple").group).toHaveClass("opacity-0");
    expect(layer("default").top).toHaveClass("h-35");
    expect(layer("default").bottom).toHaveClass("h-80");
  });

  it("심플 모드는 배경이 밝게 보이도록 더 짧고 옅은 띠를 보인다", () => {
    render(<WallpaperScrim simple />);

    expect(layer("simple").group).toHaveClass("opacity-100");
    expect(layer("default").group).toHaveClass("opacity-0");
    const { top, bottom } = layer("simple");
    expect(top).toHaveClass("h-24");
    expect(top.className).toContain("rgba(8,10,14,0.45)");
    expect(bottom).toHaveClass("h-56");
    expect(bottom.className).toContain("rgba(8,10,14,0.75)");
  });

  it("모드를 바꾸면 두 띠 묶음이 0.5초 동안 교차 페이드하고, 움직임 줄이기에서는 바로 바뀐다", () => {
    render(<WallpaperScrim simple />);

    for (const variant of ["default", "simple"] as const) {
      expect(layer(variant).group).toHaveClass(
        "transition-opacity",
        "duration-500",
        "motion-reduce:transition-none",
      );
    }
  });
});
