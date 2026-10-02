import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AutoEndNotice } from "../AutoEndNotice";

describe("AutoEndNotice", () => {
  it("순공·총 공부 값을 길이 표기로 보여준다", () => {
    render(
      <AutoEndNotice trigger="BACKGROUND" focusSec={3120} studySec={4080} onSeeResult={vi.fn()} />,
    );
    expect(screen.getByText("52분")).toBeInTheDocument();
    expect(screen.getByText("1시간 8분")).toBeInTheDocument();
  });

  it("결과 보기 버튼을 누르면 onSeeResult가 불린다", async () => {
    const onSeeResult = vi.fn();
    render(
      <AutoEndNotice trigger="BACKGROUND" focusSec={60} studySec={60} onSeeResult={onSeeResult} />,
    );
    screen.getByRole("button", { name: "결과 보기" }).click();
    expect(onSeeResult).toHaveBeenCalledTimes(1);
  });
});
