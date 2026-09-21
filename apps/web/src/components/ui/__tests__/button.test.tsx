import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "../button";

describe("Button", () => {
  it("subtle variant와 xl 크기로 렌더된다", () => {
    render(
      <Button variant="subtle" size="xl">
        방 만들기
      </Button>,
    );
    const button = screen.getByRole("button", { name: "방 만들기" });
    expect(button).toBeEnabled();
    expect(button.className).toContain("h-14");
    expect(button.className).toContain("bg-brand-subtle");
    expect(button.className).toContain("text-primary");
  });
});
