import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SessionPageHeaderTime } from "../SessionTimer";

describe("SessionPageHeaderTime", () => {
  it("머리 시간은 낭독용 문장을 함께 둔다", () => {
    render(<SessionPageHeaderTime focusSec={2538} />);
    expect(screen.getByText("00:42:18")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(/^순공시간 /)).toHaveTextContent("순공시간 42분 18초");
  });
});
