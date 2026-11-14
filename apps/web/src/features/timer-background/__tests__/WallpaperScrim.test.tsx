import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WallpaperScrim } from "../WallpaperScrim";

const bands = () => {
  const [top, bottom] = Array.from(screen.getByTestId("wallpaper-scrim").children);
  return { top, bottom };
};

describe("WallpaperScrim", () => {
  it("기본 모드는 위 140px·아래 320px을 어둡게 한다", () => {
    render(<WallpaperScrim simple={false} />);

    expect(bands().top).toHaveClass("h-35");
    expect(bands().bottom).toHaveClass("h-80");
  });

  it("심플 모드는 배경이 밝게 보이도록 어두운 띠를 더 짧고 옅게 한다", () => {
    render(<WallpaperScrim simple />);

    const { top, bottom } = bands();
    expect(top).toHaveClass("h-24");
    expect(top.className).toContain("rgba(8,10,14,0.45)");
    expect(bottom).toHaveClass("h-56");
    expect(bottom.className).toContain("rgba(8,10,14,0.75)");
  });
});
