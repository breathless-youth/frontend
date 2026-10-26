import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MultiTimerScreen } from "../components/MultiTimerScreen";
import { PomodoroPanel } from "../components/PomodoroPanel";
import { TimerPanel } from "../components/TimerPanel";
import { createModeState } from "../multiTimerMachine";
import type { ModeKind } from "../multiTimerMachine";
import { DEFAULT_MULTI_TIMER_SETTINGS } from "../multiTimerSettings";

/**
 * 타이머 시트의 폰 가로 배치
 *
 * jsdom은 `landscape-compact` 미디어 쿼리를 평가하지 않아 실제 배치는 브라우저에서 확인한다.
 * 여기서는 방향을 JS가 아니라 CSS가 가르는지, 그래서 회전해도 고른 칸과 휠이 그대로인지를 고정한다.
 */

function Sheet({ kind }: { kind: ModeKind }) {
  const mode = createModeState(kind, DEFAULT_MULTI_TIMER_SETTINGS);
  return (
    <MultiTimerScreen
      open
      kind={kind}
      kindLocked={false}
      onSwitchKind={() => {}}
      container={null}
      returnFocus={() => null}
      onClose={() => {}}
      primaryLabel="시작"
      primaryDisabled={false}
      onPrimary={() => {}}
      restartDisabled
      onRestart={() => {}}
    >
      {kind === "pomodoro" ? (
        <PomodoroPanel
          mode={mode}
          remainingMs={mode.clock.remainingMs}
          distracted={false}
          onChangeSettings={() => {}}
          soundOn
          onChangeSoundOn={() => {}}
        />
      ) : (
        <TimerPanel
          mode={mode}
          remainingMs={mode.clock.remainingMs}
          distracted={false}
          onChangeTimerSec={() => {}}
          soundOn
          onChangeSoundOn={() => {}}
        />
      )}
    </MultiTimerScreen>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("타이머 시트 가로 배치", () => {
  it.each(["timer", "pomodoro"] as const)("%s 화면은 방향을 JS로 감지하지 않는다", (kind) => {
    // jsdom에는 matchMedia가 없어 감시할 함수를 직접 붙였다 뗀다.
    const matchMedia = vi.fn();
    vi.stubGlobal("matchMedia", matchMedia);

    render(<Sheet kind={kind} />);

    expect(matchMedia).not.toHaveBeenCalled();
  });

  it("세로 열과 가로 세 구역 그리드가 같은 본문에 함께 선언된다", () => {
    render(<Sheet kind="pomodoro" />);

    const body = screen.getByRole("button", { name: "시작" }).closest(".flex-col");
    expect(body).toContainElement(screen.getByRole("slider"));
    expect(body).toHaveClass(
      "landscape-compact:grid",
      "landscape-compact:grid-cols-[1fr_var(--timer-stage)_1fr]",
    );
  });

  it("가로에서 머리 줄과 본문이 좌우 안전 영역을 비켜 노치가 끄기 버튼을 가리지 않는다", () => {
    render(<Sheet kind="timer" />);

    const header = screen.getByRole("button", { name: "타이머 끄기" }).parentElement!
      .parentElement!;
    const body = screen.getByRole("button", { name: "시작" }).closest(".flex-col")!;
    for (const element of [header, body]) {
      expect(element.className).toContain("landscape-compact:pl-[calc(env(safe-area-inset-left)");
      expect(element.className).toContain("landscape-compact:pr-[calc(env(safe-area-inset-right)");
    }
  });
});
