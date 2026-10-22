import type { InlineControl } from "@focusmakers/types";
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
