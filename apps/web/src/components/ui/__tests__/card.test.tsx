import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card, CardContent } from "../card";

describe("Card", () => {
  it("자식을 렌더하고 aria-label을 전달한다", () => {
    render(
      <Card aria-label="요약 카드">
        <CardContent>내용</CardContent>
      </Card>,
    );
    expect(screen.getByLabelText("요약 카드")).toBeInTheDocument();
    expect(screen.getByText("내용")).toBeInTheDocument();
  });
});
