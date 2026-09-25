import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SessionStatusPill } from "../components/SessionStatusPill";

describe("SessionStatusPill", () => {
  it("자동 감지 변화를 알리도록 라이브 리전으로 렌더한다", () => {
    render(<SessionStatusPill state="focus" label="순공시간 측정 중" />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("순공시간 측정 중");
  });

  it("상태별로 Badge variant가 갈린다", () => {
    const { rerender } = render(<SessionStatusPill state="focus" label="순공시간 측정 중" />);
    expect(screen.getByRole("status").className).toContain("bg-[var(--session-pill-bg)]");

    rerender(<SessionStatusPill state="distract" label="휴대폰을 사용 중인 것 같아요" />);
    expect(screen.getByRole("status").className).toContain("bg-[var(--session-pill-bg-distract)]");

    rerender(<SessionStatusPill state="paused" label="측정을 일시정지했어요" />);
    expect(screen.getByRole("status").className).toContain("bg-[var(--session-pill-bg-paused)]");
  });

  it("색 단독으로 상태를 전달하지 않는다 — 문구가 항상 함께 있다", () => {
    render(<SessionStatusPill state="distract" label="자리를 비운 것 같아요" />);

    expect(screen.getByText("자리를 비운 것 같아요")).toBeInTheDocument();
  });
});
