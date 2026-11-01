import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    render(<StartCoachMark onVisibleChange={vi.fn()} onSkip={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "지금 바로 시작해 보세요" });
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(screen.getByText("집중 시작을 누르면 측정 화면으로 넘어가요")).toBeInTheDocument();
  });

  it("뜨면 대상 버튼에 초점을 옮긴다", () => {
    const target = placeTarget(300);
    render(<StartCoachMark onVisibleChange={vi.fn()} onSkip={vi.fn()} />);
    expect(document.activeElement).toBe(target);
  });

  it("대상 자리를 비운 덮개 네 조각을 그린다", () => {
    placeTarget(300);
    render(<StartCoachMark onVisibleChange={vi.fn()} onSkip={vi.fn()} />);
    expect(dimPieces()).toHaveLength(4);
    expect(dimPieces()[0]).toHaveStyle({ height: "295px" });
  });

  it("덮개를 눌러도 닫히지 않고 대상 버튼 클릭은 그대로 간다", () => {
    const target = placeTarget(300);
    const onClick = vi.fn();
    target.addEventListener("click", onClick);
    render(<StartCoachMark onVisibleChange={vi.fn()} onSkip={vi.fn()} />);
    dimPieces().forEach((piece) => fireEvent.click(piece));
    expect(screen.getByRole("dialog", { name: "지금 바로 시작해 보세요" })).toBeInTheDocument();
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(target);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("Escape로는 닫히지 않는다", () => {
    placeTarget(300);
    render(<StartCoachMark onVisibleChange={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "지금 바로 시작해 보세요" })).toBeInTheDocument();
  });

  it("나중에 할게요 버튼을 누르면 onSkip을 부른다", () => {
    placeTarget(300);
    const onSkip = vi.fn();
    render(<StartCoachMark onVisibleChange={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button", { name: "나중에 할게요" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("나중에 할게요는 링 아래 12px 가운데에 놓고 눌리는 영역이 44×120 이상이다", () => {
    placeTarget(300);
    render(<StartCoachMark onVisibleChange={vi.fn()} onSkip={vi.fn()} />);
    const skip = screen.getByRole("button", { name: "나중에 할게요" });
    // 링 아래 끝 = 300 - 5 + 52 + 10 = 357
    expect(skip.parentElement).toHaveStyle({ top: "369px", left: "20px", width: "200px" });
    expect(skip).toHaveClass("min-h-11", "min-w-30", "pointer-events-auto");
  });

  it("Tab 순서가 집중 시작 다음 나중에 할게요다", async () => {
    const target = placeTarget(300);
    render(<StartCoachMark onVisibleChange={vi.fn()} onSkip={vi.fn()} />);
    expect(document.activeElement).toBe(target);
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "나중에 할게요" }));
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
    render(<StartCoachMark onVisibleChange={vi.fn()} onSkip={vi.fn()} />);
    expect(dimPieces()[0]).toHaveStyle({ height: "295px" });

    first.remove();
    placeTarget(400);
    act(() => {
      callbacks.forEach((callback) => callback());
    });
    expect(dimPieces()[0]).toHaveStyle({ height: "395px" });
  });

  it("대상 요소가 없으면 홈을 막지 않도록 아무것도 그리지 않고 안 보인다고 알린다", () => {
    const onVisibleChange = vi.fn();
    render(<StartCoachMark onVisibleChange={onVisibleChange} onSkip={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onVisibleChange).toHaveBeenLastCalledWith(false);
    expect(onVisibleChange).not.toHaveBeenCalledWith(true);
  });

  it("대상이 있으면 보인다고 알리고, 사라질 때 다시 안 보인다고 알린다", () => {
    placeTarget(300);
    const onVisibleChange = vi.fn();
    const { unmount } = render(
      <StartCoachMark onVisibleChange={onVisibleChange} onSkip={vi.fn()} />,
    );
    expect(onVisibleChange).toHaveBeenLastCalledWith(true);
    unmount();
    expect(onVisibleChange).toHaveBeenLastCalledWith(false);
  });

  it("대상이 늦게 생기면 그때 보인다고 알린다", () => {
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
    const onVisibleChange = vi.fn();
    render(<StartCoachMark onVisibleChange={onVisibleChange} onSkip={vi.fn()} />);
    expect(onVisibleChange).toHaveBeenLastCalledWith(false);

    placeTarget(300);
    act(() => {
      callbacks.forEach((callback) => callback());
    });
    expect(onVisibleChange).toHaveBeenLastCalledWith(true);
  });
});
