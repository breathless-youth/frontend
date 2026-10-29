import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StartCoachMark } from "@/features/home/StartCoachMark";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

/** 덮개 조각. 첫 조각만 접근성 트리에 남으므로 숨긴 조각까지 대화상자 안에서 센다. */
function dimPieces(): HTMLElement[] {
  return within(screen.getByRole("dialog", { name: "지금 바로 시작해 보세요" })).getAllByRole(
    "button",
    { hidden: true },
  );
}

describe("StartCoachMark", () => {
  it("제목을 aria 이름으로 읽는 비모달 대화상자다", () => {
    render(<StartCoachMark target="play" onDismiss={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "지금 바로 시작해 보세요" });
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(screen.getByText("시작 버튼을 누르면 측정 화면으로 넘어가요")).toBeInTheDocument();
  });

  it("뜨면 낭독기에 남는 닫기 조각에 초점을 옮긴다", () => {
    render(<StartCoachMark target="play" onDismiss={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "안내 닫기" }));
  });

  it("덮개를 누르면 닫는다", () => {
    const onDismiss = vi.fn();
    render(<StartCoachMark target="play" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("버튼 대상이면 대상 자리를 비운 덮개 네 조각을 그리고, 낭독기에는 닫기 버튼을 하나만 남긴다", () => {
    const onDismiss = vi.fn();
    render(
      <>
        <button type="button" data-coach="start">
          순공 시작하기
        </button>
        <StartCoachMark target="button" onDismiss={onDismiss} />
      </>,
    );
    expect(screen.getAllByRole("button", { name: "안내 닫기" })).toHaveLength(1);
    const pieces = dimPieces();
    expect(pieces).toHaveLength(4);
    fireEvent.click(pieces[3]);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("대상이 다시 마운트되고 레이아웃이 바뀌면 구멍 위치를 다시 잰다", () => {
    const callbacks: (() => void)[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          callbacks.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    function placeTarget(top: number): HTMLElement {
      const element = document.createElement("button");
      element.dataset.coach = "start";
      element.getBoundingClientRect = () =>
        DOMRect.fromRect({ x: 20, y: top, width: 200, height: 52 });
      document.body.appendChild(element);
      return element;
    }
    const first = placeTarget(300);
    render(<StartCoachMark target="button" onDismiss={() => {}} />);
    const topPiece = () => dimPieces()[0];
    expect(topPiece()).toHaveStyle({ height: "295px" });

    first.remove();
    placeTarget(400);
    act(() => {
      callbacks.forEach((callback) => callback());
    });
    expect(topPiece()).toHaveStyle({ height: "395px" });
  });

  it("버튼 대상인데 대상 요소가 없으면 덮개 한 장으로 물러서고, 가리킬 재생 원이 없어 화살표도 없다", () => {
    render(<StartCoachMark target="button" onDismiss={() => {}} />);
    expect(dimPieces()).toHaveLength(1);
    expect(
      screen.getByRole("dialog", { name: "지금 바로 시작해 보세요" }).querySelector("svg"),
    ).toBeNull();
  });

  it("재생 원 대상이면 덮개가 한 장이고 재생 원을 가리키는 화살표가 있다", () => {
    render(<StartCoachMark target="play" onDismiss={() => {}} />);
    expect(dimPieces()).toHaveLength(1);
    expect(
      screen.getByRole("dialog", { name: "지금 바로 시작해 보세요" }).querySelector("svg"),
    ).not.toBeNull();
  });
});
