import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FIXTURE_FOCUS_WEEKLY, FIXTURE_OVERTAKEN } from "@/lib/rankingFixtures";
import { stubImageLoad } from "@/test/imageStub";

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
  it("순위 숫자 없이 아바타·닉네임·값을 순서대로 보이고 내 줄을 표시한다", () => {
    render(<AroundList type="FOCUS_TIME" rows={before} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[2]).toHaveAttribute("aria-current", "true");
    expect(items[2]).toHaveTextContent(/^오늘도출석12:40:00$/);
    // 내 줄은 연한 강조 바탕이라 아바타만 진한 파랑으로 둔다.
    expect(items[2].firstElementChild).toHaveClass("bg-brand-subtle");
    expect(items[2].querySelector("[data-me]")).toHaveClass("bg-primary-deep");
    expect(items[3]).toHaveTextContent(/^도서관지박령집중 중12:34:00$/);
    expect(screen.queryByText(/1,20\d/)).toBeNull();
  });

  describe("순위 변동 칸", () => {
    /** 줄의 맨 앞 칸. 변동 칸이 없으면 아바타다. */
    const firstCell = (item: HTMLElement) => item.firstElementChild!.firstElementChild!;

    it("내려가면 내 줄에만 ▼N을 두고 다른 줄은 같은 자리를 비우며 화면 낭독기에 알린다", () => {
      render(<AroundList type="FOCUS_TIME" rows={after} change={-3} />);

      const items = screen.getAllByRole("listitem");
      items.forEach((item) => {
        const cell = firstCell(item);
        expect(cell).toHaveAttribute("aria-hidden", "true");
        expect(cell).toHaveTextContent(item.getAttribute("aria-current") ? /^▼3$/ : /^$/);
      });
      expect(screen.getByRole("status")).toHaveTextContent(/^순위가 3계단 내려갔어요$/);
    });

    it("오르면 ▲N을 두고 화면 낭독기에 오른 계단 수를 알린다", () => {
      render(<AroundList type="FOCUS_TIME" rows={after} change={2} />);

      expect(firstCell(rowOf("오늘도출석")!)).toHaveTextContent(/^▲2$/);
      expect(screen.getByRole("status")).toHaveTextContent(/^순위가 2계단 올랐어요$/);
    });

    it("같은 변동으로 다시 그리면 status 영역을 건드리지 않아 다시 읽히지 않는다", () => {
      const { rerender } = render(<AroundList type="FOCUS_TIME" rows={after} change={-3} />);
      const status = screen.getByRole("status");
      const observer = new MutationObserver(() => undefined);
      observer.observe(status, { childList: true, characterData: true, subtree: true });

      rerender(<AroundList type="FOCUS_TIME" rows={[...after]} change={-3} />);

      expect(screen.getByRole("status")).toBe(status);
      expect(observer.takeRecords()).toEqual([]);
      observer.disconnect();
    });

    it("그대로면 -를 두고 화면 낭독기에는 알리지 않는다", () => {
      render(<AroundList type="FOCUS_TIME" rows={after} change={0} />);

      expect(firstCell(rowOf("오늘도출석")!)).toHaveTextContent(/^-$/);
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });

    it("기준선이 없으면 내 줄도 빈 칸이다", () => {
      render(<AroundList type="FOCUS_TIME" rows={after} change={null} />);

      expect(firstCell(rowOf("오늘도출석")!)).toHaveTextContent(/^$/);
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });

    it("변동을 보이지 않는 판은 칸 없이 아바타부터 시작한다", () => {
      render(<AroundList type="FOCUS_RATE" rows={after} />);

      expect(firstCell(rowOf("오늘도출석")!)).toHaveAttribute("data-slot", "avatar");
      expect(screen.queryByText(/[▲▼]/)).toBeNull();
    });
  });

  it("집중 중인 줄은 닉네임 아래 글자 대신 값 앞에 표시를 둔다", () => {
    render(<AroundList type="FOCUS_TIME" rows={before} />);

    const items = screen.getAllByRole("listitem");
    expect(within(items[3]!).getByText("집중 중").parentElement).toHaveTextContent(
      /^집중 중12:34:00$/,
    );
  });

  it("집중 중인 줄에만 낭독기에서 숨긴 깜빡이는 점을 두고, 움직임 줄이기 설정이면 멈춘다", () => {
    render(<AroundList type="FOCUS_TIME" rows={before} />);

    const items = screen.getAllByRole("listitem");
    const dot = within(items[3]!).getByText("집중 중").previousElementSibling;
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveClass("animate-pulse", "motion-reduce:animate-none");
    expect(within(items[0]!).queryByText("집중 중")).toBeNull();
    expect(items[0]!.querySelector(".animate-pulse")).toBeNull();
  });

  it("창 밖으로 나간 줄은 잠깐 남았다 사라진다", () => {
    vi.useFakeTimers();
    const { rerender } = render(<AroundList type="FOCUS_TIME" rows={before} />);

    rerender(<AroundList type="FOCUS_TIME" rows={after} change={-3} />);
    expect(screen.getByText("형광펜")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText("형광펜")).toBeNull();
  });

  it("모션 줄이기면 나간 줄을 남기지 않는다", () => {
    stubReducedMotion(true);
    const { rerender } = render(<AroundList type="FOCUS_TIME" rows={before} />);

    rerender(<AroundList type="FOCUS_TIME" rows={after} change={-3} />);

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
      const { rerender } = render(<AroundList type="FOCUS_TIME" rows={before} />);
      animate.mockClear();

      rerender(<AroundList type="FOCUS_TIME" rows={swapped} />);

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
      const { rerender } = render(<AroundList type="FOCUS_TIME" rows={before} />);
      animate.mockClear();

      rerender(<AroundList type="FOCUS_TIME" rows={after} change={-3} />);

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
      const { rerender } = render(<AroundList type="FOCUS_TIME" rows={before} />);

      rerender(<AroundList type="FOCUS_TIME" rows={after} change={-3} />);

      expect(animate).not.toHaveBeenCalled();
    });
  });

  it("사진이 있는 줄은 마스코트 대신 사진을 그린다", async () => {
    stubImageLoad();
    const rows = interpolateRows(
      FIXTURE_FOCUS_WEEKLY.around.map((row) =>
        row.nickname === "형광펜" ? { ...row, profileImageUrl: "/avatars/3.jpg" } : row,
      ),
      0,
    );
    render(<AroundList type="FOCUS_TIME" rows={rows} />);

    await waitFor(() =>
      expect(rowOf("형광펜")?.querySelector("img")).toHaveAttribute("src", "/avatars/3.jpg"),
    );
    expect(rowOf("형광펜")?.querySelector("[data-default-mascot]")).toBeNull();
    expect(rowOf("커피세잔")?.querySelector("[data-default-mascot]")).not.toBeNull();
  });
});
