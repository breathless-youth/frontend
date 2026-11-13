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

function shift(cell: number) {
  return `translateX(${(-BOX_PX * 74 * cell) / 72}px)`;
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

  it("상태에 맞는 칸으로 시트를 바꾼다", () => {
    const { container, rerender } = render(<SessionMascot state={FOCUS} />);
    expect(cellOf(container)).toBe("1");
    rerender(<SessionMascot state={distractionState("SLEEP")} />);
    expect(cellOf(container)).toBe("4");
  });

  it("첫 렌더에서는 표정 전환을 재생하지 않는다", () => {
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

  it("표정이 바뀌면 한 번 깜빡이며 새 칸에서 끝나는 전환을 시트에 건다", () => {
    const { container, rerender } = render(<SessionMascot state={FOCUS} />);

    rerender(<SessionMascot state={distractionState("SLEEP")} />);

    expect(cellOf(container)).toBe("4");
    const calls = sheetCalls(container);
    expect(calls).toHaveLength(1);
    const [keyframes, options] = calls[0] as [Keyframe[], KeyframeAnimationOptions];
    expect(keyframes.map((frame) => frame.transform)).toEqual([
      shift(5),
      shift(3),
      shift(4),
      shift(4),
    ]);
    expect(keyframes.map((frame) => frame.offset)).toEqual([0, 0.3, 0.7, 1]);
    expect(keyframes.slice(0, -1).every((frame) => frame.easing === "steps(1, end)")).toBe(true);
    expect(options.duration).toBe(333);
  });

  it("정색으로 바뀌면 눈을 감은 채 정색에서 끝난다", () => {
    const { container, rerender } = render(<SessionMascot state={FOCUS} />);

    rerender(<SessionMascot state={distractionState("PHONE")} />);

    expect(cellOf(container)).toBe("3");
    const [keyframes] = sheetCalls(container)[0] as [Keyframe[]];
    expect(keyframes.map((frame) => frame.transform)).toEqual([shift(5), shift(3), shift(3)]);
    expect(keyframes.map((frame) => frame.offset)).toEqual([0, 0.3, 1]);
  });

  it("자리를 비우면 한 번 깜빡이고 실루엣 칸에서 끝난다", () => {
    const { container, rerender } = render(<SessionMascot state={FOCUS} />);

    rerender(<SessionMascot state={distractionState("AWAY")} />);

    expect(cellOf(container)).toBe("8");
    const [keyframes] = sheetCalls(container)[0] as [Keyframe[]];
    expect(keyframes.map((frame) => frame.transform)).toEqual([
      shift(5),
      shift(3),
      shift(8),
      shift(8),
    ]);
  });

  it("시트 폭은 칸 9개와 간격을 이은 664pt 비율이다", () => {
    const { container } = render(<SessionMascot state={FOCUS} />);
    expect(sheet(container).className).toContain("w-[calc(var(--mascot-box)*664/72)]");
  });

  it("상자 폭이 0이면 전환 없이 새 칸을 보이고 대기 깜빡임만 다시 잡는다", () => {
    const width = vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(0);
    const { container, rerender } = render(<SessionMascot state={distractionState("SLEEP")} />);

    rerender(<SessionMascot state={FOCUS} />);
    expect(cellOf(container)).toBe("1");
    expect(animate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(6000));
    expect(animate).not.toHaveBeenCalled();

    width.mockReturnValue(BOX_PX);
    act(() => vi.advanceTimersByTime(6000));
    const [keyframes] = sheetCalls(container)[0] as [Keyframe[]];
    expect(keyframes.at(-1)!.transform).toBe(shift(5));
  });

  it("끝난 전환의 후속 처리가 돌기 전에 다시 바뀌면 지난 표정의 깜빡임을 잡지 않는다", async () => {
    const { rerender } = render(<SessionMascot state={distractionState("SLEEP")} />);
    rerender(<SessionMascot state={FOCUS} />);
    rerender(<SessionMascot state={distractionState("PHONE")} />);
    expect(animate).toHaveBeenCalledTimes(2);

    await act(async () => {});
    act(() => vi.advanceTimersByTime(12000));

    expect(animate).toHaveBeenCalledTimes(2);
  });

  it("끝난 전환의 후속 처리가 돌기 전에 언마운트하면 더는 움직이지 않는다", async () => {
    const { rerender, unmount } = render(<SessionMascot state={distractionState("SLEEP")} />);
    rerender(<SessionMascot state={FOCUS} />);
    unmount();

    await act(async () => {});
    act(() => vi.advanceTimersByTime(12000));

    expect(animate).toHaveBeenCalledTimes(1);
  });

  it("몸 크기를 누르는 움직임은 쓰지 않는다", () => {
    const { rerender } = render(<SessionMascot state={FOCUS} />);
    rerender(<SessionMascot state={distractionState("SLEEP")} />);

    const transforms = animate.mock.calls.flatMap(([keyframes]) =>
      (keyframes as Keyframe[]).map((frame) => String(frame.transform)),
    );
    expect(transforms.some((transform) => transform.includes("scale"))).toBe(false);
  });

  it("전환 중에 다시 바뀌면 앞 전환을 취소하고 마지막 상태의 칸으로 간다", () => {
    const first = pendingAnimation();
    animate.mockImplementationOnce(() => first);
    const { container, rerender } = render(<SessionMascot state={FOCUS} />);
    rerender(<SessionMascot state={distractionState("SLEEP")} />);

    rerender(<SessionMascot state={distractionState("PHONE")} />);

    expect(first.cancel).toHaveBeenCalled();
    expect(cellOf(container)).toBe("3");
    const [keyframes] = sheetCalls(container).at(-1) as [Keyframe[]];
    expect(keyframes.at(-1)!.transform).toBe(shift(3));
  });

  it("전환이 끝나기 전에는 깜빡임을 잡지 않고 끝난 뒤에 잡는다", async () => {
    let finish!: () => void;
    const transition = {
      cancel: vi.fn(),
      finished: new Promise<void>((resolve) => {
        finish = resolve;
      }),
    };
    animate.mockImplementationOnce(() => transition);
    const { rerender } = render(<SessionMascot state={distractionState("SLEEP")} />);
    rerender(<SessionMascot state={FOCUS} />);
    expect(animate).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(12000));
    expect(animate).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    act(() => vi.advanceTimersByTime(6000));
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it("전환 중에 언마운트하면 전환을 취소한다", () => {
    const transition = pendingAnimation();
    animate.mockImplementation(() => transition);
    const { rerender, unmount } = render(<SessionMascot state={FOCUS} />);
    rerender(<SessionMascot state={distractionState("SLEEP")} />);
    expect(animate).toHaveBeenCalledTimes(1);

    unmount();

    expect(transition.cancel).toHaveBeenCalled();
  });

  it("animate가 없는 환경에서는 칸만 바로 바꾼다", () => {
    // @ts-expect-error Web Animations API가 없는 환경을 흉내 낸다
    delete Element.prototype.animate;
    const { container, rerender } = render(<SessionMascot state={distractionState("PHONE")} />);
    rerender(<SessionMascot state={FOCUS} />);
    expect(cellOf(container)).toBe("1");
    act(() => vi.advanceTimersByTime(12000));
  });

  describe("모션 축소", () => {
    it("전환 없이 칸만 바로 바꾸고 깜빡이지 않는다", () => {
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
    it("전환 중에 숨으면 전환을 취소하고 다시 보이면 대기 깜빡임만 잡는다", () => {
      const transition = pendingAnimation();
      animate.mockImplementationOnce(() => transition);
      const { container, rerender } = render(<SessionMascot state={distractionState("SLEEP")} />);
      rerender(<SessionMascot state={FOCUS} />);

      hidden = true;
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(transition.cancel).toHaveBeenCalled();

      hidden = false;
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(animate).toHaveBeenCalledTimes(1);
      act(() => vi.advanceTimersByTime(6000));

      expect(animate).toHaveBeenCalledTimes(2);
      const [keyframes] = sheetCalls(container)[1] as [Keyframe[]];
      expect(keyframes.map((frame) => frame.transform)).toEqual([
        shift(5),
        shift(3),
        shift(5),
        shift(5),
      ]);
    });

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
