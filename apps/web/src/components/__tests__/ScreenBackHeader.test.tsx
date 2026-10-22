import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import { trackScreenBackPressed } from "@/lib/amplitude";
import { enterGlassChrome, pressNative, resetGlassChrome } from "@/test/nativeControlStub";

import { ScreenBackHeader } from "../ScreenBackHeader";

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackScreenBackPressed: vi.fn(),
}));

function renderHeader(props: { title?: string; onBack?: () => void }) {
  return render(
    <MemoryRouter initialEntries={["/terms"]}>
      <ScreenBackHeader {...props} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  resetGlassChrome();
  vi.clearAllMocks();
});

describe("ScreenBackHeader", () => {
  it("뒤로 가기를 누르면 화면 이탈을 남기고 onBack을 부르며, 제목은 h1이다", () => {
    const onBack = vi.fn();
    renderHeader({ title: "이용약관", onBack });

    fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(vi.mocked(trackScreenBackPressed)).toHaveBeenCalledWith("/terms");
    expect(screen.getByRole("heading", { level: 1, name: "이용약관" })).toBeInTheDocument();
  });

  it("앱 모드에서는 뒤로 가기 줄을 앱에 맡기고 앱의 누름으로 같은 뒤로 가기를 한다", () => {
    const postMessage = enterGlassChrome("/terms");
    const onBack = vi.fn();
    renderHeader({ title: "이용약관", onBack });

    expect(screen.queryByRole("button", { name: "뒤로 가기" })).not.toBeInTheDocument();
    const sent = postMessage.mock.calls
      .map(([raw]) => JSON.parse(raw as string) as { type: string; top?: unknown })
      .filter((message) => message.type === "set-glass-chrome");
    expect(sent.at(-1)?.top).toEqual({
      leading: "back",
      leadingLabel: "뒤로 가기",
      title: "이용약관",
    });

    pressNative("chrome:leading", 0);

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(vi.mocked(trackScreenBackPressed)).toHaveBeenCalledWith("/terms");
  });
});
