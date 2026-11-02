import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SessionPageHeaderTime } from "../SessionTimer";

describe("SessionPageHeaderTime", () => {
  it("머리 시간은 낭독용 문장을 함께 둔다", () => {
    render(<SessionPageHeaderTime focusSec={2538} />);
    expect(screen.getByText("00:42:18")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(/^순공시간 /)).toHaveTextContent("순공시간 42분 18초");
  });

  it("상태 색을 받으면 자기 요소에 상태 색 변수를 둔다", () => {
    render(<SessionPageHeaderTime focusSec={60} stateColor="#8b95a1" />);
    expect(screen.getByText(/^순공시간 /).parentElement).toHaveStyle({
      "--session-state-color": "#8b95a1",
    });
  });

  it("상태 색을 받지 않으면 변수를 두지 않아 세션 루트의 상태 색을 따른다", () => {
    render(<SessionPageHeaderTime focusSec={60} />);
    expect(
      screen.getByText(/^순공시간 /).parentElement!.style.getPropertyValue("--session-state-color"),
    ).toBe("");
  });
});
