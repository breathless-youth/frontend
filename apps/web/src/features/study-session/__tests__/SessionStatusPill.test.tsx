import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SessionStatusPill } from "../components/SessionStatusPill";
import { statusCopyFor } from "../sessionCopy";
import { distractionState } from "../sessionState";

describe("SessionStatusPill", () => {
  it("자동 감지 변화를 알리도록 라이브 리전으로 렌더한다", () => {
    render(<SessionStatusPill state="focus" label="집중 측정 중" />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("집중 측정 중");
  });

  it("서브 문구는 필 바깥 아래에 렌더한다", () => {
    const copy = statusCopyFor(distractionState("PHONE"));
    render(<SessionStatusPill state="distract" label={copy.label} subLabel={copy.subLabel} />);

    const pill = screen.getByText("휴대폰을 사용 중인 것 같아요").parentElement;
    expect(pill).not.toHaveTextContent("내려놓으면 자동으로 다시 측정돼요");
    expect(screen.getByText("내려놓으면 자동으로 다시 측정돼요")).toBeInTheDocument();
  });

  it("색 단독으로 상태를 전달하지 않는다 — 문구가 항상 함께 있다", () => {
    render(<SessionStatusPill state="distract" label="자리를 비운 것 같아요" />);

    expect(screen.getByText("자리를 비운 것 같아요")).toBeInTheDocument();
  });
});
