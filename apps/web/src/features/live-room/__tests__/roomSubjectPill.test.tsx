import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoomSubjectPill } from "../components/RoomSubjectPill";

afterEach(cleanup);

function renderPill(
  props: { paused?: boolean; expanded?: boolean; inactive?: boolean; onClick?: () => void } = {},
) {
  const onClick = props.onClick ?? vi.fn();
  const onSurfacePointerDown = vi.fn();
  render(
    <div onPointerDown={onSurfacePointerDown}>
      <RoomSubjectPill
        name="수학"
        focusSec={4200}
        paused={props.paused ?? false}
        expanded={props.expanded ?? false}
        inactive={props.inactive}
        onClick={onClick}
      />
    </div>,
  );
  return { pill: screen.getByRole("button", { name: /수학/ }), onClick, onSurfacePointerDown };
}

describe("RoomSubjectPill", () => {
  it("과목 이름과 과목 시간을 보인다", () => {
    const { pill } = renderPill();

    expect(pill).toHaveTextContent("수학");
    expect(pill).toHaveTextContent("01:10:00");
  });

  it("일시정지면 점이 깜빡이지 않고 옅어진다", () => {
    const { pill } = renderPill({ paused: true });

    const dot = pill.querySelector("img");
    expect(dot).toHaveClass("opacity-40");
    expect(dot).not.toHaveClass("animate-pulse");
  });

  it("측정 중이면 점이 깜빡인다", () => {
    const { pill } = renderPill();

    expect(pill.querySelector("img")).toHaveClass("animate-pulse");
  });

  it("누르면 콜백을 부르고 과목 페이지를 여는 버튼으로 알린다", () => {
    const { pill, onClick } = renderPill({ expanded: true });

    fireEvent.click(pill);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(pill).toHaveAttribute("aria-haspopup", "dialog");
    expect(pill).toHaveAttribute("aria-expanded", "true");
  });

  it("누름이 화면 탭 토글로 버블되지 않는다", () => {
    const { pill, onSurfacePointerDown } = renderPill();

    fireEvent.pointerDown(pill);

    expect(onSurfacePointerDown).not.toHaveBeenCalled();
  });

  it("보이는 알약은 누르는 영역 안에서 위아래 6px을 비운 유리 배경이다", () => {
    const { pill } = renderPill();

    expect(pill).toHaveClass("h-11", "before:inset-y-1.5", "before:bg-(--session-bar-glass-bg)");
  });

  it("태블릿에서는 바와 같은 비율로 누르는 영역과 유리 배경이 커진다", () => {
    const { pill } = renderPill();

    expect(pill).toHaveClass(
      "regular:h-13",
      "regular:before:inset-y-1.75",
      "short-side-lg:h-16.25",
      "short-side-lg:before:inset-y-2.25",
    );
  });

  it("inactive면 누름을 받지 않아 바깥 누름이 열린 메뉴를 닫는다", () => {
    const { pill } = renderPill({ inactive: true });

    expect(pill).toHaveClass("pointer-events-none");
    expect(pill).not.toHaveClass("pointer-events-auto");
  });

  it("콜백을 넘기지 않으면 누를 수 없는 글자로 그린다", () => {
    render(<RoomSubjectPill name="수학" focusSec={4200} paused={false} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("수학").parentElement).toHaveClass(
      "pointer-events-none",
      "before:bg-(--session-bar-glass-bg)",
    );
  });
});
