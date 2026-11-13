import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionMascot } from "../SessionMascot";
import { distractionState } from "../../sessionState";

const FOCUS = { kind: "FOCUS" } as const;
const BOX_PX = 80;
let animate: ReturnType<typeof vi.fn>;

/** 끝나지 않고 진행 중으로 남는 애니메이션. 취소됐는지 볼 수 있다. */
function pendingAnimation() {
  return { cancel: vi.fn(), finished: new Promise<never>(() => {}) };
}

function stubReducedMotion() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

let hidden = false;

beforeEach(() => {
  vi.useFakeTimers();
  animate = vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() }));
  Element.prototype.animate = animate as unknown as Element["animate"];
  // jsdom은 배치를 하지 않아 상자 폭이 0으로 나오므로 태블릿 상자 폭을 준다.
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(BOX_PX);
  hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // @ts-expect-error 테스트에서 붙인 것을 걷어 낸다
  delete Element.prototype.animate;
  // @ts-expect-error 인스턴스에 붙인 값을 걷어 내 원래 getter로 돌린다
  delete document.hidden;
});

function sheet(container: HTMLElement) {
  return container.querySelector("img") as HTMLImageElement;
}

function cellOf(container: HTMLElement) {
  return sheet(container).style.getPropertyValue("--mascot-cell");
}

function sheetCalls(container: HTMLElement) {
  return animate.mock.calls.filter((_, index) => animate.mock.contexts[index] === sheet(container));
}

describe("SessionMascot", () => {
  it("스크린리더에서 숨기고 탭을 받지 않는다", () => {
    const { container } = render(<SessionMascot state={FOCUS} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.className).toContain("pointer-events-none");
  });

  it("상태에 맞는 칸으로 시트를 옮긴다", () => {
    const { container, rerender } = render(<SessionMascot state={FOCUS} />);
    expect(cellOf(container)).toBe("1");
    rerender(<SessionMascot state={distractionState("SLEEP")} />);
    expect(cellOf(container)).toBe("4");
  });

  it("첫 렌더에서는 눌림도 점프도 하지 않는다", () => {
    render(<SessionMascot state={FOCUS} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it("집중에서는 4~6초 안에 한 번 깜빡인다", () => {
    const { container } = render(<SessionMascot state={FOCUS} />);
    act(() => vi.advanceTimersByTime(6000));
    expect(animate.mock.contexts).toContain(sheet(container));
  });

  it("깜빡임 키프레임은 상자 폭에서 구한 px 이동을 쓴다", () => {
    const { container } = render(<SessionMascot state={FOCUS} />);
    act(() => vi.advanceTimersByTime(6000));

    const [keyframes] = sheetCalls(container)[0] as [Keyframe[]];
    const shift = (cell: number) => `translateX(${(-BOX_PX * 74 * cell) / 72}px)`;
    expect(keyframes.map((frame) => frame.transform)).toEqual([
      shift(5),
      shift(3),
      shift(5),
      shift(5),
    ]);
    expect(keyframes.map((frame) => frame.offset)).toEqual([0, 0.3, 0.7, 1]);
  });

  it("졸림에서는 깜빡이지 않는다", () => {
    render(<SessionMascot state={distractionState("SLEEP")} />);
    act(() => vi.advanceTimersByTime(12000));
    expect(animate).not.toHaveBeenCalled();
  });

  it("딴짓에서 집중으로 돌아오면 점프 칸을 거쳐 집중 칸으로 간다", async () => {
    const { container, rerender } = render(<SessionMascot state={distractionState("PHONE")} />);
    rerender(<SessionMascot state={FOCUS} />);
    expect(cellOf(container)).toBe("7");
    await act(async () => {
      await Promise.resolve();
    });
    expect(cellOf(container)).toBe("1");
  });

  it("점프 중에 상태가 바뀌면 점프를 취소하고 마지막 상태의 칸으로 간다", () => {
    const jump = pendingAnimation();
    animate.mockImplementation(() => jump);
    const { container, rerender } = render(<SessionMascot state={distractionState("PHONE")} />);
    rerender(<SessionMascot state={FOCUS} />);
    expect(cellOf(container)).toBe("7");

    rerender(<SessionMascot state={distractionState("SLEEP")} />);

    expect(jump.cancel).toHaveBeenCalled();
    expect(cellOf(container)).toBe("4");
  });

  it("점프가 아닌 표정 변화는 몸을 살짝 눌렀다 편다", () => {
    const { container, rerender } = render(<SessionMascot state={FOCUS} />);
    expect(animate).not.toHaveBeenCalled();

    rerender(<SessionMascot state={distractionState("SLEEP")} />);

    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.contexts[0]).toBe(sheet(container).parentElement);
    expect(animate.mock.calls[0]![0]).toEqual([
      { transform: "scale(0.94)" },
      { transform: "scale(1)" },
    ]);
  });

  it("점프 중에 언마운트하면 점프를 취소한다", () => {
    const jump = pendingAnimation();
    animate.mockImplementation(() => jump);
    const { rerender, unmount } = render(<SessionMascot state={distractionState("PHONE")} />);
    rerender(<SessionMascot state={FOCUS} />);
    expect(animate).toHaveBeenCalledTimes(1);

    unmount();

    expect(jump.cancel).toHaveBeenCalled();
  });

  it("animate가 없는 환경에서는 점프 없이 바로 집중 칸으로 간다", () => {
    // @ts-expect-error Web Animations API가 없는 환경을 흉내 낸다
    delete Element.prototype.animate;
    const { container, rerender } = render(<SessionMascot state={distractionState("PHONE")} />);
    rerender(<SessionMascot state={FOCUS} />);
    expect(cellOf(container)).toBe("1");
    act(() => vi.advanceTimersByTime(12000));
  });

  describe("모션 축소", () => {
    it("점프와 눌림 없이 칸만 바꾸고 깜빡이지 않는다", () => {
      stubReducedMotion();
      const { container, rerender } = render(<SessionMascot state={distractionState("PHONE")} />);

      rerender(<SessionMascot state={FOCUS} />);
      expect(cellOf(container)).toBe("1");
      act(() => vi.advanceTimersByTime(12000));

      expect(animate).not.toHaveBeenCalled();
    });

    it("깜빡임을 기다리는 사이에 켜면 깜빡이지 않고 다시 잡지도 않는다", () => {
      render(<SessionMascot state={FOCUS} />);
      stubReducedMotion();

      act(() => vi.advanceTimersByTime(30000));

      expect(animate).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("화면 숨김", () => {
    it("숨은 동안에는 깜빡이지 않고 다시 보이면 깜빡임을 잡는다", () => {
      hidden = true;
      const { container } = render(<SessionMascot state={FOCUS} />);
      act(() => vi.advanceTimersByTime(12000));
      expect(animate).not.toHaveBeenCalled();

      hidden = false;
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      act(() => vi.advanceTimersByTime(6000));

      expect(animate.mock.contexts).toContain(sheet(container));
    });
  });

  it("언마운트하면 진행 중인 깜빡임을 취소하고 더는 움직이지 않는다", () => {
    const blink = pendingAnimation();
    animate.mockImplementation(() => blink);
    const { unmount } = render(<SessionMascot state={FOCUS} />);
    act(() => vi.advanceTimersByTime(6000));
    expect(animate).toHaveBeenCalledTimes(1);

    unmount();
    animate.mockClear();
    act(() => vi.advanceTimersByTime(30000));

    expect(blink.cancel).toHaveBeenCalled();
    expect(animate).not.toHaveBeenCalled();
  });
});
