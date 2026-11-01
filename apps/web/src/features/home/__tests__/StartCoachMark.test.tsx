import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StartCoachMark } from "@/features/home/StartCoachMark";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function placeTarget(top: number): HTMLElement {
  const element = document.createElement("button");
  element.dataset.coach = "start";
  element.textContent = "집중 시작";
  element.getBoundingClientRect = () => DOMRect.fromRect({ x: 20, y: top, width: 200, height: 52 });
  document.body.appendChild(element);
  return element;
}

function dimPieces(): HTMLElement[] {
  return within(screen.getByRole("dialog", { name: "지금 바로 시작해 보세요" })).getAllByTestId(
    "coach-dim",
  );
}

describe("StartCoachMark", () => {
  it("제목을 aria 이름으로 읽는 비모달 대화상자다", () => {
    placeTarget(300);
    render(<StartCoachMark />);
    const dialog = screen.getByRole("dialog", { name: "지금 바로 시작해 보세요" });
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(screen.getByText("집중 시작을 누르면 측정 화면으로 넘어가요")).toBeInTheDocument();
  });

  it("뜨면 대상 버튼에 초점을 옮긴다", () => {
    const target = placeTarget(300);
    render(<StartCoachMark />);
    expect(document.activeElement).toBe(target);
  });

  it("대상 자리를 비운 덮개 네 조각을 그린다", () => {
    placeTarget(300);
    render(<StartCoachMark />);
    expect(dimPieces()).toHaveLength(4);
    expect(dimPieces()[0]).toHaveStyle({ height: "295px" });
  });

  it("덮개를 눌러도 닫히지 않고 대상 버튼 클릭은 그대로 간다", () => {
    const target = placeTarget(300);
    const onClick = vi.fn();
    target.addEventListener("click", onClick);
    render(<StartCoachMark />);
    dimPieces().forEach((piece) => fireEvent.click(piece));
    expect(screen.getByRole("dialog", { name: "지금 바로 시작해 보세요" })).toBeInTheDocument();
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(target);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("Escape로는 닫히지 않는다", () => {
    placeTarget(300);
    render(<StartCoachMark />);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "지금 바로 시작해 보세요" })).toBeInTheDocument();
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
    const first = placeTarget(300);
    render(<StartCoachMark />);
    expect(dimPieces()[0]).toHaveStyle({ height: "295px" });

    first.remove();
    placeTarget(400);
    act(() => {
      callbacks.forEach((callback) => callback());
    });
    expect(dimPieces()[0]).toHaveStyle({ height: "395px" });
  });

  it("대상 요소가 없으면 홈을 막지 않도록 아무것도 그리지 않는다", () => {
    render(<StartCoachMark />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
