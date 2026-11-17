import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MASCOT_CELL } from "../../mascot/mascotExpression";
import { HelpMascot } from "../HelpMascot";

const cancel = vi.fn();
const animate = vi.fn((_keyframes: Keyframe[], _options: KeyframeAnimationOptions) => ({
  cancel,
}));
const original = Element.prototype.animate;

// 앞 테스트의 화면은 이 파일의 afterEach보다 늦게 내려가서 그때 부른 정리가 다음 테스트에 남는다.
beforeEach(() => {
  animate.mockClear();
  cancel.mockClear();
  Element.prototype.animate = animate as unknown as Element["animate"];
});
afterEach(() => {
  Element.prototype.animate = original;
  vi.unstubAllGlobals();
});

const transformsOf = (call: number) =>
  animate.mock.calls[call]![0].map((frame) => String(frame.transform));

describe("HelpMascot", () => {
  it.each([
    ["joy", MASCOT_CELL.joy],
    ["focus", MASCOT_CELL.focus],
    ["sleepy", MASCOT_CELL.sleepy],
    ["jump", MASCOT_CELL.jump],
  ] as const)("%s 자세는 스프라이트 %i번 칸을 보인다", (pose, cell) => {
    render(<HelpMascot pose={pose} />);
    expect(screen.getByTestId("help-mascot")).toHaveAttribute("data-cell", String(cell));
  });

  it("기쁨은 몸을 3px 띄우는 움직임과 깜빡임을 끝없이 되풀이한다", () => {
    render(<HelpMascot pose="joy" />);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate.mock.calls.every(([, options]) => options.iterations === Infinity)).toBe(true);
    expect(transformsOf(0)).toContain("translateY(-3px)");
  });

  it("집중은 몸은 두고 깜빡이기만 한다", () => {
    render(<HelpMascot pose="focus" />);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]![1].iterations).toBe(Infinity);
  });

  it("점프는 웃는 얼굴 그대로 몸만 6px 띄우고 깜빡이거나 기울지 않는다", () => {
    render(<HelpMascot pose="jump" />);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(transformsOf(0)).toContain("translateY(-6px)");
    expect(transformsOf(0).some((transform) => transform.includes("rotate"))).toBe(false);
  });

  it("졸림은 발끝 축으로 5도 꾸벅이고 반쯤 뜬 눈으로 깼다가 다시 감는다", () => {
    render(<HelpMascot pose="sleepy" />);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(transformsOf(0)).toContain("translateY(2px) rotate(5deg)");
    const angry = `translateX(${-74 * MASCOT_CELL.angry}px)`;
    expect(transformsOf(1)).toContain(angry);
  });

  it("자세가 바뀌거나 사라지면 이전 움직임을 멈춘다", () => {
    const { rerender, unmount } = render(<HelpMascot pose="joy" />);
    rerender(<HelpMascot pose="focus" />);
    expect(cancel).toHaveBeenCalledTimes(2);
    unmount();
    expect(cancel).toHaveBeenCalledTimes(3);
  });

  it("움직임 줄이기면 움직이지 않는다", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    render(<HelpMascot pose="joy" />);
    expect(animate).not.toHaveBeenCalled();
  });
});
