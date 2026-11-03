import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createModeState, pauseMode, startMode } from "@/features/multi-timer/multiTimerMachine";
import type { ModeKind } from "@/features/multi-timer/multiTimerMachine";
import { DEFAULT_MULTI_TIMER_SETTINGS } from "@/features/multi-timer/multiTimerSettings";
import { useMultiTimer } from "@/features/multi-timer/useMultiTimer";
import type { SessionState } from "@/features/study-session/sessionState";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import type * as AmplitudeModule from "@/lib/amplitude";
import i18n from "@/lib/i18n";

import { useRoomTimerSheet } from "../../useRoomTimerSheet";
import { LazyRoomTimerSheet, preloadRoomTimerSheet } from "../lazyRoomTimerSheet";
import { RoomTimerCapsule } from "../RoomTimerCapsule";
import { TimerButton } from "../TimerButton";

const haptic = vi.hoisted(() => vi.fn());
vi.mock("@/lib/haptics", () => ({ haptic }));
const trackMultiTimerOpened = vi.hoisted(() => vi.fn());
const trackMultiTimerClosed = vi.hoisted(() => vi.fn());
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof AmplitudeModule>()),
  trackMultiTimerOpened,
  trackMultiTimerClosed,
}));

const SETTINGS_KEY = "focuson.multiTimer.v1";
const LAST_KIND_KEY = "focuson.multiTimer.lastKind.v1";
const FOCUS: SessionState = { kind: "FOCUS" };
const HELD: SessionState = { kind: "PAUSE", trigger: "MANUAL" };

/** 화면 글자와 aria-label을 함께 모은다. 스크린리더가 읽는 이름도 영어여야 한다. */
function visibleText(root: HTMLElement): string {
  const labels = [...root.querySelectorAll("[aria-label]")].map((element) =>
    element.getAttribute("aria-label"),
  );
  return [root.textContent, ...labels].join("\n");
}

/**
 * 공부방이 타이머 버튼, 캡슐, 설정 시트를 잇는 방식 그대로인 하네스
 *
 * 알림음은 Web Audio 대신 가짜를 넣고 시계는 테스트가 가짜 타이머로 돌린다.
 */
function TimerHarness({
  landscape,
  sessionState,
  studying = true,
  onStartBreak,
  onResumeSession,
}: {
  landscape: boolean;
  sessionState: SessionState;
  studying?: boolean;
  onStartBreak: () => void;
  onResumeSession: () => void;
}) {
  const [alarm] = useState(() => ({ prime: vi.fn(), play: vi.fn(), dispose: vi.fn() }));
  const timer = useMultiTimer({
    sessionState,
    studying,
    onStartBreak,
    onEndBreak: () => undefined,
    onResumeSession,
    alarm,
  });
  const sheet = useRoomTimerSheet(timer, studying);
  return (
    <main className="theme-dark" style={sessionSurfaceStyle}>
      {sheet.active && timer.mode !== null && (
        <RoomTimerCapsule
          mode={timer.mode}
          remainingMs={timer.remainingMs}
          held={timer.held}
          timerId={sheet.capsuleTimerId}
          primaryRef={sheet.capsulePrimaryRef}
          onPrimary={timer.pressPrimary}
          onOff={timer.close}
        />
      )}
      <TimerButton
        on={sheet.active}
        expanded={sheet.open}
        describedBy={sheet.capsuleTimerId}
        onOpen={sheet.pressTimerButton}
      />
      <LazyRoomTimerSheet
        open={sheet.open}
        landscape={landscape}
        container={null}
        timer={timer}
        onClose={sheet.closeSheet}
      />
    </main>
  );
}

function renderTimerHarness({
  started,
  landscape = false,
  sessionState = FOCUS,
}: { started?: ModeKind; landscape?: boolean; sessionState?: SessionState } = {}) {
  const onStartBreak = vi.fn();
  const onResumeSession = vi.fn();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const { rerender } = render(
    <TimerHarness
      landscape={landscape}
      sessionState={sessionState}
      onStartBreak={onStartBreak}
      onResumeSession={onResumeSession}
    />,
  );
  const endSession = () =>
    rerender(
      <TimerHarness
        landscape={landscape}
        sessionState={sessionState}
        studying={false}
        onStartBreak={onStartBreak}
        onResumeSession={onResumeSession}
      />,
    );
  const start = async (kind: ModeKind) => {
    localStorage.setItem(LAST_KIND_KEY, kind);
    await user.click(screen.getByRole("button", { name: "타이머" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "타이머 설정" })).getByRole("button", {
        name: kind === "timer" ? "30분 시작" : "25분 집중 시작",
      }),
    );
  };
  return {
    user,
    onStartBreak,
    onResumeSession,
    endSession,
    start,
    ready: started === undefined ? Promise.resolve() : start(started),
    advanceToBreak: () => act(() => vi.advanceTimersByTimeAsync(25 * 60_000 + 500)),
  };
}

beforeAll(async () => {
  await preloadRoomTimerSheet();
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  haptic.mockReset();
  trackMultiTimerOpened.mockReset();
  trackMultiTimerClosed.mockReset();
});

describe("공부방 타이머 시트와 캡슐", () => {
  it("타이머 버튼은 맨 위에 기본과 뽀모도로 토글이 있는 시트를 연다", async () => {
    const { user } = renderTimerHarness();
    await user.click(screen.getByRole("button", { name: "타이머" }));
    const sheet = screen.getByRole("dialog", { name: "타이머 설정" });
    expect(
      within(sheet)
        .getAllByRole("radio")
        .map((radio) => radio.textContent),
    ).toEqual(["기본", "뽀모도로"]);
    expect(within(sheet).getByRole("radiogroup", { name: "타이머 종류" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "30분 시작" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "취소" })).toBeInTheDocument();
    expect(within(sheet).getByRole("switch", { name: "끝나면 알림음" })).toBeChecked();
  });

  it("세로에서는 아래에서 올라오는 시트로 연다", async () => {
    const portrait = renderTimerHarness();
    await portrait.user.click(screen.getByRole("button", { name: "타이머" }));
    expect(screen.getByRole("dialog", { name: "타이머 설정" })).toHaveAttribute(
      "data-placement",
      "bottom",
    );
  });

  it("가로에서는 오른쪽 패널로 연다", async () => {
    const { user } = renderTimerHarness({ landscape: true });
    await user.click(screen.getByRole("button", { name: "타이머" }));
    expect(screen.getByRole("dialog", { name: "타이머 설정" })).toHaveAttribute(
      "data-placement",
      "side",
    );
  });

  it("뽀모도로를 고르면 집중과 휴식 시간, 설명, 바뀔 때마다 알림음이 보인다", async () => {
    const { user } = renderTimerHarness();
    await user.click(screen.getByRole("button", { name: "타이머" }));
    const sheet = screen.getByRole("dialog", { name: "타이머 설정" });

    await user.click(within(sheet).getByRole("radio", { name: "뽀모도로" }));

    expect(within(sheet).getByRole("radio", { name: "뽀모도로" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(sheet).getByText("집중 25분, 휴식 5분을 번갈아 해요")).toBeInTheDocument();
    expect(within(sheet).getByRole("switch", { name: "바뀔 때마다 알림음" })).toBeInTheDocument();
    fireEvent.change(within(sheet).getByRole("combobox", { name: "집중 시간" }), {
      target: { value: "50" },
    });
    expect(within(sheet).getByRole("button", { name: "50분 집중 시작" })).toBeInTheDocument();
    expect(within(sheet).getByText("집중 50분, 휴식 5분을 번갈아 해요")).toBeInTheDocument();
  });

  it("휠로 고른 시간이 시작 버튼 글자가 된다", async () => {
    const { user } = renderTimerHarness();
    await user.click(screen.getByRole("button", { name: "타이머" }));
    const sheet = screen.getByRole("dialog", { name: "타이머 설정" });

    fireEvent.keyDown(within(sheet).getByRole("spinbutton", { name: "시간" }), { key: "ArrowUp" });

    expect(within(sheet).getByRole("button", { name: "1시간 30분 시작" })).toBeInTheDocument();
  });

  it("시작하면 시트가 닫히고 캡슐이 뜬다", async () => {
    const { user } = renderTimerHarness();
    await user.click(screen.getByRole("button", { name: "타이머" }));
    await user.click(screen.getByRole("button", { name: "30분 시작" }));
    expect(screen.queryByRole("dialog", { name: "타이머 설정" })).toBeNull();
    expect(screen.getByTestId("room-timer-capsule")).toHaveTextContent("30:00");
    expect(screen.getByRole("button", { name: "타이머" })).toHaveAttribute("data-on", "true");
    expect(haptic).toHaveBeenCalledWith("medium");
  });

  it("취소하면 타이머를 켜지 않고 시트를 닫는다", async () => {
    const { user } = renderTimerHarness();
    await user.click(screen.getByRole("button", { name: "타이머" }));

    await user.click(screen.getByRole("button", { name: "취소" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "타이머 설정" })).toBeNull());
    expect(screen.queryByTestId("room-timer-capsule")).toBeNull();
    expect(screen.getByRole("button", { name: "타이머" })).toHaveAttribute("data-on", "false");
    // 싱글룸처럼 시작하지 않고 닫은 모드도 꺼진 것으로 남긴다.
    expect(trackMultiTimerClosed).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "timer", state: "setup", started: false }),
    );
  });

  it.each([
    ["세로", false],
    ["가로", true],
  ])("%s에서 시트를 닫으면 타이머 버튼으로 포커스가 돌아간다", async (_, landscape) => {
    const { user } = renderTimerHarness({ landscape });
    await user.click(screen.getByRole("button", { name: "타이머" }));

    await user.click(screen.getByRole("button", { name: "취소" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "타이머" })).toHaveFocus());
  });

  it("공부가 끝나면 열려 있던 시트도 닫힌다", async () => {
    const { user, endSession } = renderTimerHarness();
    await user.click(screen.getByRole("button", { name: "타이머" }));

    endSession();

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "타이머 설정" })).toBeNull());
    expect(screen.getByRole("button", { name: "타이머" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("끄기는 확인 없이 바로 끈다", async () => {
    const { user, ready } = renderTimerHarness({ started: "timer" });
    await ready;
    await user.click(screen.getByRole("button", { name: "끄기" }));
    expect(screen.queryByTestId("room-timer-capsule")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("멈춤을 누르면 시간이 서고 계속으로 바뀐다", async () => {
    const { user, ready } = renderTimerHarness({ started: "timer" });
    await ready;
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    await user.click(screen.getByRole("button", { name: "멈춤" }));
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(screen.getByTestId("room-timer-capsule")).toHaveTextContent("29:55");
    expect(screen.getByRole("button", { name: "계속" })).toBeInTheDocument();
  });

  it("휴식 중 캡슐은 초록 휴식이다", async () => {
    const { advanceToBreak, ready, onStartBreak } = renderTimerHarness({ started: "pomodoro" });
    await ready;
    expect(screen.getByTestId("room-timer-capsule")).toHaveAttribute("data-phase", "focus");
    expect(screen.getByText("집중")).toBeInTheDocument();

    await advanceToBreak();

    expect(screen.getByTestId("room-timer-capsule")).toHaveAttribute("data-phase", "break");
    expect(screen.getByText("휴식")).toBeInTheDocument();
    expect(onStartBreak).toHaveBeenCalled();
  });

  it("타이머가 도는 동안 타이머 버튼을 눌러도 타이머는 그대로다", async () => {
    const { user, ready } = renderTimerHarness({ started: "pomodoro" });
    await ready;
    await act(() => vi.advanceTimersByTimeAsync(60_000));

    await user.click(screen.getByRole("button", { name: "타이머" }));

    expect(screen.queryByRole("dialog", { name: "타이머 설정" })).toBeNull();
    expect(screen.getByTestId("room-timer-capsule")).toHaveTextContent("24:00");
    expect(trackMultiTimerOpened).toHaveBeenCalledOnce();
  });

  it("끝난 기본 타이머는 다시 누르면 시트를 새로 연다", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ timerSec: 45, focusMin: 25, breakMin: 5 }));
    const { user } = renderTimerHarness();
    await user.click(screen.getByRole("button", { name: "타이머" }));
    await user.click(screen.getByRole("button", { name: "45초 시작" }));
    await act(() => vi.advanceTimersByTimeAsync(46_000));
    expect(screen.queryByTestId("room-timer-capsule")).toBeNull();

    await user.click(screen.getByRole("button", { name: "타이머" }));

    expect(screen.getByRole("dialog", { name: "타이머 설정" })).toBeInTheDocument();
    expect(trackMultiTimerOpened).toHaveBeenCalledTimes(2);
  });

  it("카메라가 꺼져 멈춘 동안의 캡슐은 계속이고 누르면 공부방을 다시 시작하게 한다", async () => {
    const { user, start, onResumeSession } = renderTimerHarness({ sessionState: HELD });
    await start("timer");
    onResumeSession.mockClear();

    await user.click(screen.getByRole("button", { name: "계속" }));

    expect(onResumeSession).toHaveBeenCalledOnce();
  });

  it("시트는 클릭 분석이 글자와 aria-label을 싣지 않게 가린다", async () => {
    const { user } = renderTimerHarness();
    await user.click(screen.getByRole("button", { name: "타이머" }));
    const sheet = screen.getByRole("dialog", { name: "타이머 설정" });

    expect(sheet).toHaveAttribute("data-amp-mask");
    expect(sheet).toHaveAttribute("data-amp-mask-attributes", "aria-label");
  });
});

describe("공부방 타이머 캡슐의 멈춤과 계속", () => {
  const running = () => startMode(createModeState("timer", DEFAULT_MULTI_TIMER_SETTINGS));

  it("흐르는 타이머는 멈춤이고 카메라를 꺼 공부방이 멈춘 동안은 계속이다", () => {
    const mode = running();
    const { rerender } = render(
      <RoomTimerCapsule
        mode={mode}
        remainingMs={1_800_000}
        held={false}
        onPrimary={vi.fn()}
        onOff={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "멈춤" })).toBeInTheDocument();
    expect(screen.getByTestId("icon-pause")).toBeInTheDocument();

    rerender(
      <RoomTimerCapsule
        mode={mode}
        remainingMs={1_800_000}
        held
        onPrimary={vi.fn()}
        onOff={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "계속" })).toBeInTheDocument();
    expect(screen.getByTestId("icon-play")).toBeInTheDocument();
  });

  it("멈춘 타이머는 계속이다", () => {
    render(
      <RoomTimerCapsule
        mode={pauseMode(running(), Date.now())}
        remainingMs={1_800_000}
        held={false}
        onPrimary={vi.fn()}
        onOff={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "계속" })).toBeInTheDocument();
    expect(screen.getByTestId("icon-play")).toBeInTheDocument();
  });
});

describe("공부방 타이머 영어 화면", () => {
  afterEach(async () => {
    await i18n.changeLanguage("ko");
  });

  it("영어로 바꾸면 타이머 시트의 두 종류 모두 한글이 남지 않는다", async () => {
    await i18n.changeLanguage("en");
    const { user } = renderTimerHarness();
    await user.click(screen.getByRole("button", { name: "Timer" }));
    const sheet = screen.getByRole("dialog", { name: "Timer settings" });

    expect(
      within(sheet)
        .getAllByRole("radio")
        .map((radio) => radio.textContent),
    ).toEqual(["Timer", "Pomodoro"]);
    expect(within(sheet).getByRole("radiogroup", { name: "Timer type" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Start 30 minutes" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(sheet).getByRole("switch", { name: "Alarm when the timer ends" })).toBeChecked();
    expect(visibleText(sheet)).not.toMatch(/[가-힣]/);

    await user.click(within(sheet).getByRole("radio", { name: "Pomodoro" }));

    expect(
      within(sheet).getByText("Focus for 25 minutes, then take a break for 5 minutes, and repeat"),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole("switch", { name: "Alarm when focus or break ends" }),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Focus for 25 minutes" })).toBeInTheDocument();
    expect(visibleText(sheet)).not.toMatch(/[가-힣]/);
  });

  it("영어로 바꿔도 흐르는 뽀모도로 캡슐은 집중 단계와 멈춤 버튼을 그린다", async () => {
    await i18n.changeLanguage("en");
    localStorage.setItem(LAST_KIND_KEY, "pomodoro");
    const { user } = renderTimerHarness();
    await user.click(screen.getByRole("button", { name: "Timer" }));
    await user.click(screen.getByRole("button", { name: "Focus for 25 minutes" }));

    const capsule = screen.getByTestId("room-timer-capsule");
    expect(within(capsule).getByText("Focus")).toBeInTheDocument();
    expect(within(capsule).getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(within(capsule).getByRole("button", { name: "Turn off timer" })).toBeInTheDocument();
    expect(visibleText(capsule)).not.toMatch(/[가-힣]/);
  });
});
