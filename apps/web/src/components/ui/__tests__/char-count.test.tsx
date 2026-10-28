import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CharCount } from "../char-count";

describe("CharCount", () => {
  it("한도 이하면 숫자만 보이고 알림이 없다", () => {
    render(<CharCount id="c" length={5} max={20} overMessage="20자까지 쓸 수 있어요" />);
    expect(screen.getByText("5/20")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("한도를 넘으면 숫자가 빨갛게 바뀌고 문구를 알린다", () => {
    render(<CharCount id="c" length={21} max={20} overMessage="20자까지 쓸 수 있어요" />);
    expect(screen.getByText("21/20")).toHaveClass("text-state-distract-text");
    expect(screen.getByRole("alert")).toHaveTextContent("20자까지 쓸 수 있어요");
  });

  it("showFrom 비율에 못 미치면 아무것도 그리지 않는다", () => {
    const { container, rerender } = render(
      <CharCount id="c" length={79} max={100} showFrom={0.8} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<CharCount id="c" length={80} max={100} showFrom={0.8} />);
    expect(screen.getByText("80/100")).toBeInTheDocument();
  });

  it("overMessage가 없으면 넘쳐도 숫자만 바뀐다", () => {
    render(<CharCount id="c" length={13} max={12} />);
    expect(screen.getByText("13/12")).toHaveClass("text-state-distract-text");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
