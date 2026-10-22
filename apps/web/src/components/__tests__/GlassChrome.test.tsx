import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlassChrome } from "@/components/GlassChrome";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { __resetGlassChromeForTests, useNativeControlPressRelay } from "@/lib/glassChrome";
import { __resetModalOverlayForTests } from "@/lib/nativeModalOverlay";

type SentChrome = {
  type: "set-glass-chrome";
  top: { title: string | null; leading: string; leadingLabel: string } | null;
  obscured: boolean;
};

function Harness(props: ComponentProps<typeof GlassChrome>) {
  useNativeControlPressRelay();
  return <GlassChrome {...props} />;
}

function enterNativeMode(): ReturnType<typeof vi.fn> {
  window.history.replaceState(null, "", "/manual-record?glassChrome=1");
  const postMessage = vi.fn();
  vi.stubGlobal("ReactNativeWebView", { postMessage });
  __resetGlassChromeForTests();
  return postMessage;
}

function sentChrome(postMessage: ReturnType<typeof vi.fn>): SentChrome[] {
  return postMessage.mock.calls
    .map(([raw]) => JSON.parse(raw as string) as SentChrome)
    .filter((message) => message.type === "set-glass-chrome");
}

function lastChrome(postMessage: ReturnType<typeof vi.fn>): SentChrome | undefined {
  return sentChrome(postMessage).at(-1);
}

function press(id: string): void {
  act(() => {
    (globalThis as unknown as Record<string, (raw: string) => void>)[NATIVE_MESSAGE_ENTRY](
      JSON.stringify({ type: "native-control-press", id, value: 0, atMs: 1 }),
    );
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  __resetGlassChromeForTests();
  __resetModalOverlayForTests();
  document.body.innerHTML = "";
});

describe("CSS 대체 모드", () => {
  it("뒤로 버튼과 제목을 그리고 누르면 onLeading을 부른다", () => {
    const onLeading = vi.fn();
    render(<GlassChrome top={{ leading: "back", onLeading, title: "이용약관" }} />);

    fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(onLeading).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { level: 1, name: "이용약관" })).toBeInTheDocument();
  });

  it("닫기 버튼은 기본 라벨이 닫기다", () => {
    render(<GlassChrome top={{ leading: "close", onLeading: vi.fn() }} />);

    expect(screen.getByRole("button", { name: "닫기" })).toBeInTheDocument();
  });

  it("가운데 요소를 제목 자리에 뒤로 버튼과 같은 줄로 그린다", () => {
    const onCenter = vi.fn();
    render(
      <GlassChrome
        top={{
          leading: "back",
          onLeading: vi.fn(),
          center: (
            <h1>
              <button type="button" onClick={onCenter}>
                10월 22일 (수)
              </button>
            </h1>
          ),
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "10월 22일 (수)" }));

    expect(onCenter).toHaveBeenCalledTimes(1);
    const bar = screen.getByRole("button", { name: "뒤로 가기" }).parentElement!;
    expect(bar).toContainElement(screen.getByRole("heading", { level: 1 }));
  });

  it("앱에 아무것도 보내지 않는다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    __resetGlassChromeForTests();

    render(<GlassChrome top={{ leading: "back", onLeading: vi.fn(), title: "문의하기" }} />);

    expect(sentChrome(postMessage)).toEqual([]);
  });
});

describe("앱 모드", () => {
  it("웹 버튼 없이 뒤로 가기와 제목을 앱에 보낸다", () => {
    const postMessage = enterNativeMode();

    render(<Harness top={{ leading: "back", onLeading: vi.fn(), title: "시간 직접 입력" }} />);

    expect(screen.queryByRole("button", { name: "뒤로 가기" })).not.toBeInTheDocument();
    expect(lastChrome(postMessage)).toEqual({
      type: "set-glass-chrome",
      top: { leading: "back", leadingLabel: "뒤로 가기", title: "시간 직접 입력" },
      obscured: false,
      atMs: expect.any(Number),
    });
  });

  it("가운데 요소는 웹이 그리고 앱에는 제목 없이 뒤로 가기만 맡긴다", () => {
    const postMessage = enterNativeMode();
    const onLeading = vi.fn();
    const onCenter = vi.fn();
    render(
      <Harness
        top={{
          leading: "back",
          onLeading,
          title: "플래너",
          center: (
            <button type="button" onClick={onCenter}>
              10월 22일 (수)
            </button>
          ),
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "뒤로 가기" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "10월 22일 (수)" }));
    expect(onCenter).toHaveBeenCalledTimes(1);
    expect(lastChrome(postMessage)?.top).toEqual({
      leading: "back",
      leadingLabel: "뒤로 가기",
      title: null,
    });

    press("chrome:leading");

    expect(onLeading).toHaveBeenCalledTimes(1);
  });

  it("앱이 메시지를 통째로 버리지 않게 긴 글자는 자르고 빈 제목은 null로 보낸다", () => {
    const postMessage = enterNativeMode();
    const { rerender } = render(
      <Harness top={{ leading: "back", onLeading: vi.fn(), title: "가".repeat(60) }} />,
    );
    expect(lastChrome(postMessage)?.top?.title).toHaveLength(40);

    rerender(<Harness top={{ leading: "back", onLeading: vi.fn(), title: "" }} />);

    expect(lastChrome(postMessage)?.top?.title).toBeNull();
  });

  it("언마운트하면 비운 상태를 보낸다", () => {
    const postMessage = enterNativeMode();
    const { unmount } = render(<Harness top={{ leading: "back", onLeading: vi.fn() }} />);

    unmount();

    expect(lastChrome(postMessage)).toMatchObject({ top: null, obscured: false });
  });

  it("bfcache에서 되살아나면 지금 상태를 다시 보낸다", () => {
    const postMessage = enterNativeMode();
    render(<Harness top={{ leading: "back", onLeading: vi.fn(), title: "설정" }} />);
    postMessage.mockClear();

    act(() => {
      const event = new Event("pageshow");
      Object.defineProperty(event, "persisted", { value: true });
      window.dispatchEvent(event);
    });

    expect(sentChrome(postMessage)).toMatchObject([{ top: { title: "설정" } }]);
  });

  it("웹 모달이 열리면 obscured: true를 보낸다", async () => {
    const postMessage = enterNativeMode();
    render(<Harness top={{ leading: "back", onLeading: vi.fn(), title: "플래너" }} />);

    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);

    await waitFor(() => {
      expect(lastChrome(postMessage)).toMatchObject({ top: { title: "플래너" }, obscured: true });
    });
  });

  it("둘이 함께 놓였다가 하나가 사라지면 남은 쪽의 위쪽 줄을 보낸다", () => {
    const postMessage = enterNativeMode();
    const before = { leading: "back", onLeading: vi.fn(), title: "기록" } as const;
    const after = { leading: "back", onLeading: vi.fn(), title: "기록 수정" } as const;
    const { rerender } = render(
      <>
        <Harness key="after" top={after} />
        <GlassChrome key="before" top={before} />
      </>,
    );

    rerender(<Harness key="after" top={after} />);

    expect(lastChrome(postMessage)).toMatchObject({ top: { title: "기록 수정" } });
  });
});
