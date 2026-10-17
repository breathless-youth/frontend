import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FIXTURE_FOCUS_WEEKLY, FIXTURE_OVERTAKEN, FIXTURE_SLOT_DAILY } from "@/lib/rankingFixtures";

import { interpolateRows } from "../../model/live";
import { AroundList } from "../AroundList";

function stubReducedMotion(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") && matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// jsdom에는 Web Animations가 없어 줄 움직임을 보려는 테스트만 호출을 기록하는 가짜를 붙인다.
const animate = vi.fn<HTMLElement["animate"]>(() => ({}) as Animation);

/** 그 요소에 건 애니메이션의 키프레임과 옵션. */
function animationsOn(element: Element | null) {
  return animate.mock.calls.flatMap(([keyframes, options], index) =>
    animate.mock.contexts[index] === element ? [{ keyframes, options }] : [],
  );
}

function rowOf(nickname: string): HTMLElement | null {
  return screen.getByText(nickname).closest("li");
}

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
  vi.useRealTimers();
});

const before = interpolateRows(FIXTURE_FOCUS_WEEKLY.around, 0);
const after = interpolateRows(FIXTURE_OVERTAKEN.around, 0);

describe("AroundList", () => {
  it("순위·닉네임 첫 글자·닉네임·값을 순서대로 보이고 내 줄을 표시한다", () => {
    render(<AroundList type="FOCUS_TIME" rows={before} drop={null} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[2]).toHaveAttribute("aria-current", "true");
    expect(items[2]).toHaveTextContent("1,205오오늘도출석12:40:00");
    expect(items[3]).toHaveTextContent("도서관지박령집중 중12:34:00");
  });

  it("집중 중인 줄은 닉네임 아래 글자 대신 값 앞에 표시를 둔다", () => {
    render(<AroundList type="FOCUS_TIME" rows={before} drop={null} />);

    const items = screen.getAllByRole("listitem");
    expect(within(items[3]!).getByText("집중 중").parentElement).toHaveTextContent(
      /^집중 중12:34:00$/,
    );
  });

  it("집중 중인 줄에만 낭독기에서 숨긴 깜빡이는 점을 두고, 움직임 줄이기 설정이면 멈춘다", () => {
    render(<AroundList type="FOCUS_TIME" rows={before} drop={null} />);

    const items = screen.getAllByRole("listitem");
    const dot = within(items[3]!).getByText("집중 중").previousElementSibling;
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveClass("animate-pulse", "motion-reduce:animate-none");
    expect(within(items[0]!).queryByText("집중 중")).toBeNull();
    expect(items[0]!.querySelector(".animate-pulse")).toBeNull();
  });

  it("▼N을 내 줄에 붙이고 화면 낭독기에 한 번 알린다", () => {
    render(<AroundList type="FOCUS_TIME" rows={after} drop={3} />);

    expect(screen.getByText("▼3")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("순위가 3계단 내려갔어요");
  });

  it("순위 칸 폭은 보이는 줄 중 가장 긴 순위에 맞춘다", () => {
    const short = render(
      <AroundList
        type="TIME_SLOT"
        rows={interpolateRows(FIXTURE_SLOT_DAILY.around, 0)}
        drop={null}
      />,
    );
    expect(screen.getByText("4")).toHaveStyle({ width: "1ch" });
    short.unmount();

    const long = render(<AroundList type="FOCUS_TIME" rows={before} drop={null} />);
    expect(screen.getByText("1,205")).toHaveStyle({ width: "5ch" });
    long.unmount();

    render(
      <AroundList
        type="FOCUS_TIME"
        rows={before.map((row, index) => ({ ...row, rank: 998 + index }))}
        drop={null}
      />,
    );
    expect(screen.getByText("998")).toHaveStyle({ width: "5ch" });
    expect(screen.getByText("1,000")).toHaveStyle({ width: "5ch" });
  });

  it("나간 줄이 남아 있는 동안은 그 순위까지 넣어 폭을 정하고, 사라진 뒤에 좁힌다", () => {
    vi.useFakeTimers();
    const wide = before.map((row, index) => ({ ...row, rank: 998 + index }));
    // 998·999위였던 두 사람만 남고 나머지 세 줄은 창 밖으로 나간다.
    const narrow = interpolateRows(
      [
        { rank: 995, nickname: "새벽반장", value: 47900, focusing: false, me: false },
        { rank: 996, nickname: "열공모드", value: 47800, focusing: false, me: false },
        { ...FIXTURE_FOCUS_WEEKLY.around[0]!, rank: 997 },
        { ...FIXTURE_FOCUS_WEEKLY.around[1]!, rank: 998 },
        { rank: 999, nickname: "수능D-40", value: 46000, focusing: false, me: false },
      ],
      0,
    );
    const { rerender } = render(<AroundList type="FOCUS_TIME" rows={wide} drop={null} />);

    rerender(<AroundList type="FOCUS_TIME" rows={narrow} drop={null} />);
    expect(screen.getByText("1,000")).toHaveStyle({ width: "5ch" });
    expect(screen.getByText("995")).toHaveStyle({ width: "5ch" });

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText("1,000")).toBeNull();
    expect(screen.getByText("995")).toHaveStyle({ width: "3ch" });
  });

  it("창 밖으로 나간 줄은 잠깐 남았다 사라진다", () => {
    vi.useFakeTimers();
    const { rerender } = render(<AroundList type="FOCUS_TIME" rows={before} drop={null} />);

    rerender(<AroundList type="FOCUS_TIME" rows={after} drop={3} />);
    expect(screen.getByText("형광펜")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText("형광펜")).toBeNull();
  });

  it("모션 줄이기면 나간 줄을 남기지 않는다", () => {
    stubReducedMotion(true);
    const { rerender } = render(<AroundList type="FOCUS_TIME" rows={before} drop={null} />);

    rerender(<AroundList type="FOCUS_TIME" rows={after} drop={3} />);

    expect(screen.queryByText("형광펜")).toBeNull();
  });

  describe("줄 움직임", () => {
    beforeEach(() => {
      animate.mockClear();
      HTMLElement.prototype.animate = animate;
    });

    it("자리가 바뀐 줄만 직전 자리에서 새 자리로 미끄러진다", () => {
      // 나와 바로 위 줄이 자리를 바꾼다.
      const swapped = [
        before[0]!,
        { ...before[2]!, rank: 1204 },
        { ...before[1]!, rank: 1205 },
        before[3]!,
        before[4]!,
      ];
      const { rerender } = render(<AroundList type="FOCUS_TIME" rows={before} drop={null} />);
      animate.mockClear();

      rerender(<AroundList type="FOCUS_TIME" rows={swapped} drop={null} />);

      expect(animationsOn(rowOf("오늘도출석"))).toEqual([
        {
          keyframes: { transform: ["translateY(100px)", "translateY(50px)"] },
          options: expect.objectContaining({ duration: 300 }),
        },
      ]);
      expect(animationsOn(rowOf("커피세잔"))).toEqual([
        {
          keyframes: { transform: ["translateY(50px)", "translateY(100px)"] },
          options: expect.objectContaining({ duration: 300 }),
        },
      ]);
      for (const nickname of ["형광펜", "도서관지박령", "공시생J"]) {
        expect(animationsOn(rowOf(nickname))).toEqual([]);
      }
    });

    it("나간 줄이 150ms에 사라진 뒤 새 줄이 150ms에 나타나고 나간 줄에는 포커스가 가지 않는다", () => {
      const { rerender } = render(<AroundList type="FOCUS_TIME" rows={before} drop={null} />);
      animate.mockClear();

      rerender(<AroundList type="FOCUS_TIME" rows={after} drop={3} />);

      for (const nickname of ["형광펜", "커피세잔"]) {
        expect(animationsOn(rowOf(nickname))).toEqual([
          {
            keyframes: { opacity: [1, 0] },
            options: expect.objectContaining({ duration: 150, fill: "forwards" }),
          },
        ]);
      }
      // 기다리는 동안에도 투명하게 두어야 나가는 줄과 글자가 겹치지 않는다.
      for (const nickname of ["새벽반장", "열공모드"]) {
        expect(animationsOn(rowOf(nickname))).toEqual([
          {
            keyframes: { opacity: [0, 1] },
            options: expect.objectContaining({ duration: 150, delay: 150, fill: "backwards" }),
          },
        ]);
      }
      expect(rowOf("형광펜")).toHaveAttribute("inert");
    });

    it("모션 줄이기면 어떤 줄도 움직이지 않는다", () => {
      stubReducedMotion(true);
      const { rerender } = render(<AroundList type="FOCUS_TIME" rows={before} drop={null} />);

      rerender(<AroundList type="FOCUS_TIME" rows={after} drop={3} />);

      expect(animate).not.toHaveBeenCalled();
    });
  });
});
