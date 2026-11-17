import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  enterGlassChrome,
  lastInlineControls,
  measureControlsNow,
  resetGlassChrome,
} from "@/test/nativeControlStub";

import { SpaceButton } from "../SpaceButton";

afterEach(() => {
  cleanup();
  resetGlassChrome();
});

describe("SpaceButton", () => {
  it("공간 페이지를 여는 버튼이고 열린 상태를 aria-expanded로 알린다", async () => {
    const onClick = vi.fn();
    render(<SpaceButton expanded={false} onClick={onClick} />);

    const button = screen.getByRole("button", { name: "공간" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("앱에 session-space id와 photo 기호로 등록하고 inactive면 앱 버튼 누름만 막는다", () => {
    const postMessage = enterGlassChrome("/room/1", "segment,switch,button,button-style");
    measureControlsNow();

    render(<SpaceButton inactive expanded={false} onClick={() => {}} />);

    expect(lastInlineControls(postMessage)).toMatchObject([
      { id: "session-space", systemImage: "photo", disabled: true },
    ]);
  });
});
