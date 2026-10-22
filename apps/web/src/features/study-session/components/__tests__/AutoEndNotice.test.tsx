import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AutoEndNotice } from "../AutoEndNotice";

const haptic = vi.hoisted(() => vi.fn());
vi.mock("@/lib/haptics", () => ({ haptic }));

afterEach(() => vi.clearAllMocks());

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

  it("안내가 뜨면 medium 햅틱을 한 번만 울린다 — StrictMode 이중 실행과 다시 그리기에도", () => {
    const { rerender } = render(
      <StrictMode>
        <AutoEndNotice trigger="BACKGROUND" focusSec={60} studySec={60} onSeeResult={vi.fn()} />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <AutoEndNotice trigger="BACKGROUND" focusSec={61} studySec={61} onSeeResult={vi.fn()} />
      </StrictMode>,
    );

    expect(haptic).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith("medium");
  });
});
