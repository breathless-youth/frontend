import type { InlineControl, NativeButtonTone } from "@focusmakers/types";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetGlassChromeForTests } from "@/lib/glassChrome";
import { __resetModalOverlayForTests } from "@/lib/nativeModalOverlay";
import { useNativeControl } from "@/lib/nativeControls";
import { slideNavigate } from "@/lib/pageTransition";
import { enterGlassChrome, pressNative, resetGlassChrome } from "@/test/nativeControlStub";
import { resetViewTransitionStub, stubViewTransition } from "@/test/viewTransitionStub";

type SentInline = {
  type: "set-inline-controls";
  controls: InlineControl[];
  hidden: boolean;
  colorScheme?: "dark";
};

function Segment({
  selected = 0,
  labels = ["일간", "주간"],
  onPress = () => {},
}: {
  selected?: number;
  labels?: string[];
  onPress?: (value: number) => void;
}) {
  const { ref, native } = useNativeControl<HTMLDivElement>(
    {
      id: "segment-daily-weekly",
      kind: "segment",
      labels,
      selected,
      disabled: labels.map(() => false),
      accessibilityLabel: "",
    },
    onPress,
  );
  return (
    <div ref={ref} role="tablist" aria-label="기간">
      {native ? "앱" : "웹"}
    </div>
  );
}

function Medal({ label, disabled = false }: { label: string; disabled?: boolean }) {
  const { ref } = useNativeControl<HTMLButtonElement>(
    {
      id: "button-medal",
      kind: "button",
      title: "18",
      systemImage: "medal.fill",
      shape: "capsule",
      disabled,
      accessibilityLabel: label,
    },
    () => {},
  );
  return <button ref={ref} type="button" aria-label={label} />;
}

function ImageButton({
  image,
  systemImage = null,
}: {
  image: string;
  systemImage?: string | null;
}) {
  const { ref, native } = useNativeControl<HTMLButtonElement>(
    {
      id: "button-planner",
      kind: "button",
      title: null,
      systemImage,
      image,
      shape: "circle",
      disabled: false,
      accessibilityLabel: "플래너",
    },
    () => {},
  );
  return (
    <button ref={ref} type="button" aria-label="플래너">
      {native ? "앱" : "웹"}
    </button>
  );
}

function NumberedSwitch({ index, onPress }: { index: number; onPress: (value: number) => void }) {
  const label = `스위치 ${index}`;
  const { ref, native } = useNativeControl<HTMLButtonElement>(
    {
      id: `switch-${index}`,
      kind: "switch",
      on: false,
      disabled: false,
      interactive: true,
      accessibilityLabel: label,
    },
    onPress,
  );
  return (
    <button ref={ref} type="button" role="switch" aria-checked={false} aria-label={label}>
      {native ? "앱" : "웹"}
    </button>
  );
}

function StyledButton({
  tone = "active",
  turns = 0,
  faded = false,
  measureIcon = false,
  iconScale,
  iconWidth,
  Icon = "svg",
}: {
  tone?: NativeButtonTone;
  turns?: number;
  faded?: boolean;
  measureIcon?: boolean;
  iconScale?: number;
  iconWidth?: number;
  Icon?: "svg" | "img";
}) {
  const { ref, native } = useNativeControl<HTMLButtonElement>(
    {
      id: "session-flip",
      kind: "button",
      title: null,
      systemImage: "arrow.triangle.2.circlepath.camera",
      shape: "circle",
      disabled: false,
      accessibilityLabel: "카메라 전환",
      tone,
      turns,
      faded,
    },
    () => {},
    { measureIcon, iconScale },
  );
  return (
    <button ref={ref} type="button" aria-label="카메라 전환">
      <Icon style={iconWidth === undefined ? undefined : { width: `${iconWidth}px` }} />
      {native ? "앱" : "웹"}
    </button>
  );
}

const WITH_BUTTON_STYLE = "segment,switch,button,button-style";

function sentInline(postMessage: ReturnType<typeof vi.fn>): SentInline[] {
  return postMessage.mock.calls
    .map(([raw]) => JSON.parse(raw as string) as SentInline)
    .filter((message) => message.type === "set-inline-controls");
}

function lastInline(postMessage: ReturnType<typeof vi.fn>): SentInline | undefined {
  return sentInline(postMessage).at(-1);
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 20,
    y: 100,
    left: 20,
    top: 100,
    right: 220,
    bottom: 136,
    width: 200,
    height: 36,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  // 언마운트가 보내는 마지막 메시지가 다음 테스트의 스텁으로 새지 않게 먼저 언마운트한다.
  cleanup();
  resetGlassChrome();
  __resetModalOverlayForTests();
  resetViewTransitionStub();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("앱 모드", () => {
  it("등록한 세그먼트를 스크롤 위치를 더한 문서 좌표로 보낸다", () => {
    const postMessage = enterGlassChrome("/records");
    vi.stubGlobal("scrollX", 5);
    vi.stubGlobal("scrollY", 300);

    render(<Segment />);

    expect(lastInline(postMessage)).toEqual({
      type: "set-inline-controls",
      controls: [
        {
          id: "segment-daily-weekly",
          kind: "segment",
          frame: { x: 25, y: 400, width: 200, height: 36 },
          labels: ["일간", "주간"],
          selected: 0,
          disabled: [false, false],
          // 빈 라벨은 앱이 메시지 전체를 버리므로 없는 것으로 보낸다.
          accessibilityLabel: null,
        },
      ],
      hidden: false,
      atMs: expect.any(Number),
    });
  });

  it("웹 원본은 자리를 지킨 채 숨기고 언마운트하면 되돌린 뒤 빈 목록을 보낸다", () => {
    const postMessage = enterGlassChrome("/records");
    const { unmount } = render(<Segment />);
    const tablist = screen.getByRole("tablist", { hidden: true });

    expect(tablist).toHaveStyle({ visibility: "hidden" });
    expect(tablist).toHaveAttribute("aria-hidden", "true");
    expect(tablist).toHaveTextContent("앱");

    unmount();

    expect(tablist).not.toHaveAttribute("aria-hidden");
    expect(tablist.style.visibility).toBe("");
    expect(lastInline(postMessage)?.controls).toEqual([]);
  });

  it("버튼의 누를 수 없는 상태를 함께 보낸다", () => {
    const postMessage = enterGlassChrome("/ranking");
    const { rerender } = render(<Medal label="랭킹 기록" />);

    rerender(<Medal label="랭킹 기록" disabled />);

    expect(lastInline(postMessage)?.controls).toMatchObject([
      { id: "button-medal", kind: "button", disabled: true },
    ]);
  });

  it("버튼은 앱에 포함된 이미지 이름을 보내고 앱이 받을 수 없는 이름이면 웹으로 그린다", () => {
    const postMessage = enterGlassChrome("/home");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(<ImageButton image="planner" />);

    expect(lastInline(postMessage)?.controls).toMatchObject([
      { id: "button-planner", kind: "button", systemImage: null, image: "planner" },
    ]);

    rerender(<ImageButton image="../planner" />);

    expect(screen.getByRole("button", { name: "플래너" })).toHaveTextContent("웹");
    expect(lastInline(postMessage)?.controls).toEqual([]);
  });

  it("앱이 받을 수 없는 SF Symbol 이름이면 웹으로 그린다", () => {
    const postMessage = enterGlassChrome("/home");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<ImageButton image="planner" systemImage="../calendar" />);

    expect(screen.getByRole("button", { name: "플래너" })).toHaveTextContent("웹");
    expect(sentInline(postMessage)).toEqual([]);
  });

  it("좌표가 앱이 받는 범위를 벗어난 부품만 빼고 나머지는 보낸다", () => {
    const postMessage = enterGlassChrome("/ranking");
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.getAttribute("role") === "tablist"
        ? new DOMRect(20, 200000, 200, 36)
        : new DOMRect(20, 100, 200, 36);
    });

    render(
      <>
        <Segment />
        <Medal label="랭킹 기록" />
      </>,
    );

    expect(lastInline(postMessage)?.controls.map((control) => control.id)).toEqual([
      "button-medal",
    ]);
  });

  it("위쪽 요소가 빠져 부품이 올라가면 문서 높이가 그대로여도 새 좌표로 다시 보낸다", async () => {
    const postMessage = enterGlassChrome("/ranking/records");
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() =>
      document.getElementById("summary") === null
        ? new DOMRect(20, 60, 200, 36)
        : new DOMRect(20, 100, 200, 36),
    );
    function Page({ summary }: { summary: boolean }) {
      return (
        <>
          {summary && <div id="summary" />}
          <Segment />
        </>
      );
    }
    const { rerender } = render(<Page summary />);
    expect(lastInline(postMessage)?.controls[0]?.frame.y).toBe(100);

    rerender(<Page summary={false} />);

    await waitFor(() => {
      expect(lastInline(postMessage)?.controls[0]?.frame.y).toBe(60);
    });
  });

  it("부품과 상관없는 요소가 붙어도 목록이 같으면 다시 보내지 않는다", async () => {
    const postMessage = enterGlassChrome("/records");
    render(<Segment />);
    const sentBefore = sentInline(postMessage).length;

    document.body.appendChild(document.createElement("div"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sentInline(postMessage)).toHaveLength(sentBefore);
  });

  it("상태가 바뀌면 다시 보낸다", () => {
    const postMessage = enterGlassChrome("/records");
    const { rerender } = render(<Segment selected={0} />);

    rerender(<Segment selected={1} />);

    expect(lastInline(postMessage)?.controls).toMatchObject([{ selected: 1 }]);
    expect(screen.getByRole("tablist", { hidden: true })).toHaveAttribute("aria-hidden", "true");
  });

  it("네이티브 누름을 onPress로 넘기고 앱 모양을 웹 값으로 다시 맞춘다", () => {
    const postMessage = enterGlassChrome("/records");
    const onPress = vi.fn();
    render(<Segment onPress={onPress} />);
    const sentBefore = sentInline(postMessage).length;

    pressNative("segment-daily-weekly", 1);

    expect(onPress).toHaveBeenCalledWith(1);
    expect(sentInline(postMessage)).toHaveLength(sentBefore + 1);
    expect(lastInline(postMessage)?.controls).toMatchObject([{ selected: 0 }]);
  });

  it("웹 모달이 열리면 hidden: true를 보낸다", async () => {
    const postMessage = enterGlassChrome("/records");
    render(<Segment />);

    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);

    await waitFor(() => {
      expect(lastInline(postMessage)?.hidden).toBe(true);
    });
  });

  it("페이지 전환 중에는 숨기고 끝나면 다시 보인다", async () => {
    const postMessage = enterGlassChrome("/records");
    const { finish } = stubViewTransition();
    render(<Segment />);

    slideNavigate("forward", () => {});
    expect(lastInline(postMessage)?.hidden).toBe(true);

    finish();
    await waitFor(() => {
      expect(lastInline(postMessage)?.hidden).toBe(false);
    });
  });

  it("앱이 받는 길이로 글자를 자르고 고칠 수 없는 부품은 웹으로 그린다", () => {
    const postMessage = enterGlassChrome("/records");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(
      <>
        <Segment labels={["일간"]} />
        <Medal label={"메".repeat(50)} />
      </>,
    );
    rerender(
      <>
        <Segment labels={["일간"]} />
        <Medal label={"메".repeat(50)} />
      </>,
    );

    expect(lastInline(postMessage)?.controls).toMatchObject([
      { id: "button-medal", accessibilityLabel: "메".repeat(40) },
    ]);
    const tablist = screen.getByRole("tablist", { name: "기간" });
    expect(tablist).toHaveTextContent("웹");
    expect(tablist.style.visibility).toBe("");
    const invalidWarnings = warn.mock.calls.filter((args) => args.includes("segment-daily-weekly"));
    expect(invalidWarnings).toHaveLength(1);
  });

  it("bfcache에서 되살아나면 목록을 다시 보낸다", () => {
    const postMessage = enterGlassChrome("/settings");
    render(<Segment />);
    postMessage.mockClear();

    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    window.dispatchEvent(event);

    expect(sentInline(postMessage)).toMatchObject([{ controls: [{ id: "segment-daily-weekly" }] }]);
  });

  it("앱이 받는 32개를 넘은 부품은 보내지 않고 웹으로 그린다", () => {
    const postMessage = enterGlassChrome("/settings");
    const onPress = vi.fn();
    render(
      <>
        {Array.from({ length: 33 }, (_, index) => (
          <NumberedSwitch key={index} index={index} onPress={onPress} />
        ))}
      </>,
    );

    const sentIds = lastInline(postMessage)?.controls.map((control) => control.id);
    expect(sentIds).toHaveLength(32);
    expect(sentIds).not.toContain("switch-32");
    const overflow = screen.getByRole("switch", { name: "스위치 32" });
    expect(overflow).toHaveTextContent("웹");
    expect(overflow).not.toHaveAttribute("aria-hidden");
    expect(overflow.style.visibility).toBe("");

    pressNative("switch-32", 1);

    expect(onPress).not.toHaveBeenCalled();
  });

  it("앱이 그린다고 알리지 않은 종류는 보내지 않고 웹으로 그린다", () => {
    const postMessage = enterGlassChrome("/records", "switch,button");

    render(<Segment />);

    const tablist = screen.getByRole("tablist", { name: "기간" });
    expect(tablist).toHaveTextContent("웹");
    expect(tablist).not.toHaveAttribute("aria-hidden");
    expect(sentInline(postMessage)).toEqual([]);
  });

  it("크기가 없는 요소는 빼고 보낸다", () => {
    const postMessage = enterGlassChrome("/records");
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect());

    render(<Segment />);

    expect(lastInline(postMessage)?.controls).toEqual([]);
  });

  it("버튼 모양 필드를 쓰는 부품은 앱이 button-style을 알리지 않으면 웹으로 그린다", () => {
    const postMessage = enterGlassChrome("/room/1");

    render(<StyledButton />);

    expect(screen.getByRole("button", { name: "카메라 전환" })).toHaveTextContent("웹");
    expect(sentInline(postMessage)).toEqual([]);
  });

  it("button-style을 알린 앱에는 색 역할·회전 수·흐림을 함께 보낸다", () => {
    const postMessage = enterGlassChrome("/room/1", WITH_BUTTON_STYLE);
    const { rerender } = render(<StyledButton />);

    rerender(<StyledButton turns={1} faded />);

    expect(lastInline(postMessage)?.controls).toMatchObject([
      { id: "session-flip", tone: "active", turns: 1, faded: true },
    ]);
  });

  it.each([
    [23, 23],
    [80, 64],
  ])("measureIcon이면 아이콘 폭 %s를 iconSize %s로 보낸다", (width, iconSize) => {
    const postMessage = enterGlassChrome("/room/1", WITH_BUTTON_STYLE);

    render(<StyledButton measureIcon iconWidth={width} />);

    expect(lastInline(postMessage)?.controls).toMatchObject([{ iconSize }]);
  });

  it("이미지 아이콘도 폭을 재 iconSize로 보낸다", () => {
    const postMessage = enterGlassChrome("/room/1", WITH_BUTTON_STYLE);

    render(<StyledButton measureIcon Icon="img" iconWidth={23} />);

    expect(lastInline(postMessage)?.controls).toMatchObject([{ iconSize: 23 }]);
  });

  it("아이콘이 나타나는 확대 중에도 변형 전 CSS 폭을 iconSize로 보낸다", () => {
    const postMessage = enterGlassChrome("/room/1", WITH_BUTTON_STYLE);
    // 웹 아이콘 등장 효과가 scale(0.6)에서 시작해 화면상 폭이 줄어든 순간이다.
    vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 23 * 0.6, 23 * 0.6),
    );

    render(<StyledButton measureIcon iconWidth={23} />);

    expect(lastInline(postMessage)?.controls).toMatchObject([{ iconSize: 23 }]);
  });

  it("iconScale이 있으면 측정한 아이콘 폭에 곱해 보낸다", () => {
    const postMessage = enterGlassChrome("/room/1", WITH_BUTTON_STYLE);

    render(<StyledButton measureIcon iconScale={0.5} iconWidth={28} />);

    expect(lastInline(postMessage)?.controls).toMatchObject([{ iconSize: 14 }]);
  });

  it("아이콘 폭이 0이면 iconSize를 보내지 않아 앱 기본 크기로 그린다", () => {
    const postMessage = enterGlassChrome("/room/1", WITH_BUTTON_STYLE);

    render(<StyledButton measureIcon />);

    expect(lastInline(postMessage)?.controls[0]).not.toHaveProperty("iconSize");
  });

  it("회전 수가 0 이상의 정수가 아니면 웹으로 그린다", () => {
    const postMessage = enterGlassChrome("/room/1", WITH_BUTTON_STYLE);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<StyledButton turns={-1} />);

    expect(screen.getByRole("button", { name: "카메라 전환" })).toHaveTextContent("웹");
    expect(sentInline(postMessage)).toEqual([]);
  });

  it.each([
    ["앱이 모르는 색 역할", { tone: "glow" as NativeButtonTone }],
    ["불리언이 아닌 흐림", { faded: "true" as unknown as boolean }],
  ])("%s이면 웹으로 그린다", (_, props) => {
    const postMessage = enterGlassChrome("/room/1", WITH_BUTTON_STYLE);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<StyledButton {...props} />);

    expect(screen.getByRole("button", { name: "카메라 전환" })).toHaveTextContent("웹");
    expect(sentInline(postMessage)).toEqual([]);
  });

  it("theme-dark 안에 등록된 부품이 있으면 colorScheme dark를 보낸다", () => {
    const postMessage = enterGlassChrome("/ranking");

    render(
      <div className="theme-dark">
        <Medal label="랭킹 기록" />
      </div>,
    );

    expect(lastInline(postMessage)?.colorScheme).toBe("dark");
  });

  it("theme-dark 밖의 부품만 있으면 colorScheme을 보내지 않는다", () => {
    const postMessage = enterGlassChrome("/ranking");

    render(<Medal label="랭킹 기록" />);

    expect(lastInline(postMessage)).not.toHaveProperty("colorScheme");
  });
});

describe("CSS 전환 따라가기", () => {
  const pending = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  let top = 100;
  let running: "transition" | "animation" | null = null;

  class FakeCSSTransition {
    playState = "running";
  }
  class FakeCSSAnimation {
    playState = "running";
  }

  /**
   * 다음 프레임 콜백 실행
   *
   * 그 안에서 요청한 프레임은 다음 차례로 남는다.
   */
  function runFrame() {
    const callbacks = [...pending.values()];
    pending.clear();
    for (const callback of callbacks) {
      callback(0);
    }
  }

  function fire(type: string) {
    document.body.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function stubAnimations() {
    vi.stubGlobal("CSSTransition", FakeCSSTransition);
    Object.defineProperty(document, "getAnimations", {
      configurable: true,
      value: () =>
        running === "transition"
          ? [new FakeCSSTransition()]
          : running === "animation"
            ? [new FakeCSSAnimation()]
            : [],
    });
  }

  beforeEach(() => {
    pending.clear();
    top = 100;
    running = null;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      nextFrame += 1;
      pending.set(nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      pending.delete(id);
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(20, top, 200, 36),
    );
  });

  afterEach(() => {
    Reflect.deleteProperty(document, "getAnimations");
  });

  function renderSegment() {
    const postMessage = enterGlassChrome("/social/room/1");
    render(<Segment />);
    runFrame();
    return () => lastInline(postMessage)?.controls[0]?.frame.y;
  }

  it("CSS 전환이 도는 동안 매 프레임 다시 재 움직인 좌표를 보내고, 끝나면 멈춘다", () => {
    stubAnimations();
    const sentY = renderSegment();
    expect(sentY()).toBe(100);

    running = "transition";
    top = 300;
    fire("transitionrun");
    runFrame();
    expect(sentY()).toBe(300);

    top = 200;
    runFrame();
    expect(sentY()).toBe(200);

    running = null;
    top = 150;
    fire("transitionend");
    runFrame();
    expect(sentY()).toBe(150);
    expect(pending.size).toBe(0);
  });

  it("도는 것이 CSS 애니메이션뿐이면 한 번만 재고 멈춘다", () => {
    stubAnimations();
    const sentY = renderSegment();

    running = "animation";
    top = 300;
    fire("transitionrun");
    runFrame();

    expect(sentY()).toBe(300);
    expect(pending.size).toBe(0);
  });

  it("전환이 끝났다는 알림만 와도 다시 잰다", () => {
    stubAnimations();
    const sentY = renderSegment();

    top = 250;
    fire("transitionend");
    runFrame();

    expect(sentY()).toBe(250);
  });

  it("getAnimations가 없으면 매 프레임 재지 않지만 전환이 끝나면 다시 잰다", () => {
    const sentY = renderSegment();

    top = 300;
    fire("transitionrun");
    runFrame();
    expect(sentY()).toBe(300);
    expect(pending.size).toBe(0);

    top = 150;
    fire("transitioncancel");
    runFrame();
    expect(sentY()).toBe(150);
  });

  it("등록이 모두 빠지면 전환을 더 따라가지 않는다", () => {
    stubAnimations();
    const postMessage = enterGlassChrome("/social/room/1");
    const { unmount } = render(<Segment />);
    runFrame();
    running = "transition";
    fire("transitionrun");

    unmount();
    runFrame();
    const sentAfterUnmount = sentInline(postMessage).length;
    fire("transitionrun");
    runFrame();

    expect(sentInline(postMessage)).toHaveLength(sentAfterUnmount);
    expect(pending.size).toBe(0);
  });
});

describe("표시가 없으면", () => {
  it("아무것도 보내지 않고 웹 원본을 건드리지 않는다", () => {
    window.history.replaceState(null, "", "/records");
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    __resetGlassChromeForTests();

    render(<Segment />);

    const tablist = screen.getByRole("tablist", { name: "기간" });
    expect(tablist).toHaveTextContent("웹");
    expect(tablist).not.toHaveAttribute("aria-hidden");
    expect(postMessage).not.toHaveBeenCalled();
  });
});
