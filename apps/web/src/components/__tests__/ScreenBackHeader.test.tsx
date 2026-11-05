import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
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

function renderHeader(props: { title?: string; onBack?: () => void; trailing?: ReactNode }) {
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

  it("오른쪽 요소는 웹 모드에서 제목과 함께 그린다", () => {
    renderHeader({
      title: "수능 D-200 밤샘반",
      trailing: <button type="button">그룹 메뉴</button>,
    });

    expect(screen.getByRole("heading", { name: "수능 D-200 밤샘반" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "그룹 메뉴" })).toBeInTheDocument();
  });

  it("앱 모드에서도 오른쪽 요소와 제목은 웹이 그리고 앱에는 제목을 보내지 않는다", () => {
    const postMessage = enterGlassChrome("/social/rooms/1");
    renderHeader({
      title: "수능 D-200 밤샘반",
      trailing: <button type="button">그룹 메뉴</button>,
    });

    const sent = postMessage.mock.calls
      .map(
        ([raw]) =>
          JSON.parse(raw as string) as { type: string; top?: { title: string | null } | null },
      )
      .filter((message) => message.type === "set-glass-chrome");
    expect(sent.at(-1)?.top?.title).toBeNull();
    expect(screen.getByRole("heading", { name: "수능 D-200 밤샘반" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "그룹 메뉴" })).toBeInTheDocument();
  });
});
