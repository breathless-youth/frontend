import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionState } from "../../study-session/sessionState";
import { restoreMultiTimerStorage, setMultiTimerStorage } from "../multiTimerSettings";
import { useMultiTimer } from "../useMultiTimer";

const haptic = vi.hoisted(() => vi.fn());
vi.mock("@/lib/haptics", () => ({ haptic }));

const KEY = "focuson.multiTimer.v1";

const FOCUS: SessionState = { kind: "FOCUS" };
const AWAY: SessionState = { kind: "DISTRACTION", trigger: "AWAY" };
const BACKGROUND: SessionState = { kind: "PAUSE", trigger: "BACKGROUND" };
const BREAK: SessionState = { kind: "PAUSE", trigger: "BREAK" };

let store: Map<string, string>;

function memoryStorage(): Storage {
  store = new Map();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

function saved(): unknown {
  const raw = store.get(KEY);
  return raw === undefined ? null : JSON.parse(raw);
}

interface Props {
  readonly sessionState: SessionState;
  readonly studying: boolean;
}

function setup() {
  const alarm = { prime: vi.fn(), play: vi.fn(), dispose: vi.fn() };
  const onStartBreak = vi.fn();
  const onEndBreak = vi.fn();
  const onResumeSession = vi.fn();
  let renderCount = 0;
  const view = renderHook(
    (props: Props) => {
      renderCount += 1;
      return useMultiTimer({ ...props, onStartBreak, onEndBreak, onResumeSession, alarm });
    },
    { initialProps: { sessionState: FOCUS, studying: true } },
  );
  const session = (sessionState: SessionState, studying = true) =>
    view.rerender({ sessionState, studying });
  const renders = () => renderCount;
  return { ...view, session, renders, alarm, onStartBreak, onEndBreak, onResumeSession };
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  setMultiTimerStorage(memoryStorage());
});

afterEach(() => {
  restoreMultiTimerStorage();
  vi.useRealTimers();
  haptic.mockReset();
});

describe("useMultiTimer", () => {
  it("open 은 저장된 설정으로 설정 화면을 연다", () => {
    store.set(KEY, JSON.stringify({ timerSec: 90, focusMin: 25, breakMin: 5 }));
    const { result } = setup();

    expect(result.current.mode).toBeNull();
    act(() => result.current.open("timer"));

    expect(result.current.mode?.status).toBe("setup");
    expect(result.current.mode?.settings.timerSec).toBe(90);
    expect(result.current.remainingMs).toBe(90_000);
    expect(result.current.primaryLabel).toBe("시작");
    expect(result.current.primaryTone).toBe("primary");
    expect(result.current.showRestart).toBe(false);
  });

  it("시작하면 설정을 저장하고 실제 시간 기준으로 줄어든다", () => {
    const { result, alarm } = setup();
    act(() => result.current.open("timer"));
    act(() => result.current.pressPrimary());

    expect(alarm.prime).toHaveBeenCalledTimes(1);
    expect(saved()).toEqual({ timerSec: 1800, focusMin: 25, breakMin: 5 });

    advance(10_000);
    expect(result.current.remainingMs).toBe(1_790_000);
    expect(result.current.primaryLabel).toBe("일시정지");
    expect(result.current.primaryTone).toBe("secondary");
  });

  it("같은 초를 그리는 틱과 시작 직후의 같은 동기화는 다시 그리지 않는다", () => {
    const { result, renders } = setup();
    act(() => result.current.open("timer"));

    const beforeStart = renders();
    act(() => result.current.pressPrimary());
    expect(renders() - beforeStart).toBe(1);

    const beforeTicks = renders();
    // act 하나로 몰아 돌리면 렌더가 한 번으로 묶여서 틱마다 따로 흘린다.
    for (let i = 0; i < 8; i += 1) advance(250);
    expect(renders() - beforeTicks).toBeGreaterThanOrEqual(2);
    expect(renders() - beforeTicks).toBeLessThanOrEqual(3);
    expect(result.current.remainingMs).toBe(1_798_000);
  });

  it("시작할 때 그 모드의 값만 저장값에 합친다", () => {
    store.set(KEY, JSON.stringify({ timerSec: 90, focusMin: 40, breakMin: 10 }));
    const { result } = setup();

    act(() => result.current.open("timer"));
    act(() => result.current.changeSettings({ timerSec: 600, focusMin: 99 }));
    act(() => result.current.pressPrimary());
    expect(saved()).toEqual({ timerSec: 600, focusMin: 40, breakMin: 10 });

    act(() => result.current.open("pomodoro"));
    act(() => result.current.changeSettings({ timerSec: 30, focusMin: 50, breakMin: 15 }));
    act(() => result.current.pressPrimary());
    expect(saved()).toEqual({ timerSec: 600, focusMin: 50, breakMin: 15 });
  });

  it("타이머가 0초면 시작이 막힌다", () => {
    const { result, alarm } = setup();
    act(() => result.current.open("timer"));
    act(() => result.current.changeSettings({ timerSec: 0 }));

    expect(result.current.primaryDisabled).toBe(true);
    act(() => result.current.pressPrimary());

    expect(result.current.mode?.status).toBe("setup");
    expect(alarm.prime).not.toHaveBeenCalled();
    expect(saved()).toBeNull();
  });

  it("세션이 일시정지되면 시간이 멈추고 계속을 누르면 세션을 재개한다", () => {
    const { result, session, alarm, onResumeSession, onStartBreak } = setup();
    act(() => result.current.open("timer"));
    act(() => result.current.pressPrimary());
    advance(10_000);

    session(BACKGROUND);
    advance(30_000);
    expect(result.current.held).toBe(true);
    expect(result.current.remainingMs).toBe(1_790_000);
    expect(result.current.primaryLabel).toBe("계속");
    expect(result.current.primaryTone).toBe("primary");
    expect(result.current.showRestart).toBe(false);

    act(() => result.current.pressPrimary());
    expect(alarm.prime).toHaveBeenCalledTimes(2);
    expect(onResumeSession).toHaveBeenCalledTimes(1);
    expect(onStartBreak).not.toHaveBeenCalled();

    session(FOCUS);
    advance(5_000);
    expect(result.current.remainingMs).toBe(1_785_000);
  });

  it("세션이 멈춘 채 시작을 누르면 세션도 함께 다시 흐른다", () => {
    const { result, session, alarm, onResumeSession, onStartBreak } = setup();
    session(BACKGROUND);
    act(() => result.current.open("timer"));
    expect(result.current.primaryLabel).toBe("시작");

    act(() => result.current.pressPrimary());
    expect(alarm.prime).toHaveBeenCalledTimes(1);
    expect(onResumeSession).toHaveBeenCalledTimes(1);
    expect(onStartBreak).not.toHaveBeenCalled();
    expect(result.current.mode?.status).toBe("running");

    session(FOCUS);
    expect(result.current.primaryLabel).toBe("일시정지");
    advance(5_000);
    expect(result.current.remainingMs).toBe(1_795_000);
  });

  it("모드를 일시정지하면 처음부터가 보이고 계속으로 다시 흐른다", () => {
    const { result, alarm, onResumeSession } = setup();
    act(() => result.current.open("timer"));
    act(() => result.current.pressPrimary());
    advance(10_000);

    act(() => result.current.pressPrimary());
    expect(result.current.mode?.status).toBe("paused");
    expect(result.current.showRestart).toBe(true);
    expect(result.current.primaryLabel).toBe("계속");
    advance(5_000);
    expect(result.current.remainingMs).toBe(1_790_000);
    expect(alarm.prime).toHaveBeenCalledTimes(1);

    act(() => result.current.pressPrimary());
    expect(result.current.mode?.status).toBe("running");
    expect(alarm.prime).toHaveBeenCalledTimes(2);
    expect(onResumeSession).not.toHaveBeenCalled();
    advance(5_000);
    expect(result.current.remainingMs).toBe(1_785_000);

    act(() => result.current.pressPrimary());
    act(() => result.current.restart());
    expect(result.current.mode?.status).toBe("setup");
    expect(result.current.remainingMs).toBe(1_800_000);
    expect(result.current.showRestart).toBe(false);
    expect(result.current.primaryLabel).toBe("시작");
  });

  it("모드와 세션이 함께 멈췄으면 계속이 둘 다 재개한다", () => {
    const { result, session, onResumeSession } = setup();
    act(() => result.current.open("timer"));
    act(() => result.current.pressPrimary());
    advance(10_000);
    act(() => result.current.pressPrimary());
    session(BACKGROUND);

    expect(result.current.primaryLabel).toBe("계속");
    expect(result.current.showRestart).toBe(true);
    act(() => result.current.pressPrimary());

    expect(onResumeSession).toHaveBeenCalledTimes(1);
    expect(result.current.mode?.status).toBe("running");
    session(FOCUS);
    advance(5_000);
    expect(result.current.remainingMs).toBe(1_785_000);
  });

  it("타이머가 끝나면 알림을 한 번 내고 다시 설정으로 돌아간다", () => {
    const { result, alarm } = setup();
    act(() => result.current.open("timer"));
    act(() => result.current.changeSettings({ timerSec: 5 }));
    act(() => result.current.pressPrimary());
    advance(5_000);

    expect(result.current.mode?.status).toBe("done");
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.primaryLabel).toBe("다시 설정");
    expect(alarm.play).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith("heavy");

    advance(10_000);
    expect(alarm.play).toHaveBeenCalledTimes(1);

    act(() => result.current.pressPrimary());
    expect(result.current.mode?.status).toBe("setup");
    expect(result.current.remainingMs).toBe(5_000);
  });

  it("틱 전에 끝난 타이머에서 일시정지를 누르면 멈추지 않고 끝난다", () => {
    const { result, alarm } = setup();
    act(() => result.current.open("timer"));
    act(() => result.current.changeSettings({ timerSec: 5 }));
    act(() => result.current.pressPrimary());
    advance(4_900);
    act(() => {
      vi.setSystemTime(Date.now() + 200);
    });

    act(() => result.current.pressPrimary());
    expect(result.current.mode?.status).toBe("done");
    expect(result.current.primaryLabel).toBe("다시 설정");
    expect(alarm.play).toHaveBeenCalledTimes(1);
  });

  it("뽀모도로 집중이 끝나면 휴식에 들어가고 휴식이 끝나면 휴식을 끝낸다", () => {
    const { result, session, alarm, onStartBreak, onEndBreak } = setup();
    act(() => result.current.open("pomodoro"));
    act(() => result.current.changeSettings({ focusMin: 1, breakMin: 1 }));
    act(() => result.current.pressPrimary());
    advance(61_000);

    expect(onStartBreak).toHaveBeenCalledTimes(1);
    expect(onEndBreak).not.toHaveBeenCalled();
    expect(result.current.mode?.phase).toBe("break");
    expect(result.current.remainingMs).toBe(59_000);
    expect(alarm.play).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith("heavy");

    session(BREAK);
    expect(result.current.held).toBe(false);
    expect(result.current.primaryLabel).toBe("일시정지");
    advance(59_000);

    expect(onEndBreak).toHaveBeenCalledTimes(1);
    expect(onStartBreak).toHaveBeenCalledTimes(1);
    expect(result.current.mode?.phase).toBe("focus");
    expect(alarm.play).toHaveBeenCalledTimes(2);
  });

  it("휴식 중에 끄면 휴식을 끝낸다", () => {
    const { result, session, onEndBreak } = setup();
    act(() => result.current.open("pomodoro"));
    act(() => result.current.changeSettings({ focusMin: 1, breakMin: 1 }));
    act(() => result.current.pressPrimary());
    advance(60_000);
    session(BREAK);

    act(() => result.current.close());
    expect(result.current.mode).toBeNull();
    expect(onEndBreak).toHaveBeenCalledTimes(1);
  });

  it("집중 중에 끄거나 처음부터를 누르면 휴식 신호가 나가지 않는다", () => {
    const { result, onStartBreak, onEndBreak } = setup();
    act(() => result.current.open("pomodoro"));
    act(() => result.current.pressPrimary());
    act(() => result.current.pressPrimary());
    act(() => result.current.restart());
    act(() => result.current.close());

    expect(onStartBreak).not.toHaveBeenCalled();
    expect(onEndBreak).not.toHaveBeenCalled();
  });

  it("휴식 중 일시정지에서 처음부터를 누르면 휴식을 끝낸다", () => {
    const { result, session, onEndBreak } = setup();
    act(() => result.current.open("pomodoro"));
    act(() => result.current.changeSettings({ focusMin: 1, breakMin: 1 }));
    act(() => result.current.pressPrimary());
    advance(60_000);
    session(BREAK);
    act(() => result.current.pressPrimary());

    expect(onEndBreak).not.toHaveBeenCalled();
    act(() => result.current.restart());
    expect(onEndBreak).toHaveBeenCalledTimes(1);
  });

  it("휴식 중 세션이 멈췄다가 계속을 누르면 휴식으로 다시 들어간다", () => {
    const { result, session, onStartBreak, onResumeSession } = setup();
    act(() => result.current.open("pomodoro"));
    act(() => result.current.changeSettings({ focusMin: 1, breakMin: 1 }));
    act(() => result.current.pressPrimary());
    advance(60_000);
    session(BREAK);
    advance(10_000);

    session(BACKGROUND);
    advance(20_000);
    expect(result.current.primaryLabel).toBe("계속");
    expect(result.current.remainingMs).toBe(50_000);

    act(() => result.current.pressPrimary());
    expect(onStartBreak).toHaveBeenCalledTimes(2);
    expect(onResumeSession).not.toHaveBeenCalled();

    session(BREAK);
    expect(onStartBreak).toHaveBeenCalledTimes(2);
  });

  it("휴식 중 다른 길로 세션이 다시 흐르면 휴식으로 되돌린다", () => {
    const { result, session, onStartBreak } = setup();
    act(() => result.current.open("pomodoro"));
    act(() => result.current.changeSettings({ focusMin: 1, breakMin: 1 }));
    act(() => result.current.pressPrimary());
    advance(60_000);
    session(BREAK);
    session(BACKGROUND);
    expect(onStartBreak).toHaveBeenCalledTimes(1);

    session(FOCUS);
    expect(onStartBreak).toHaveBeenCalledTimes(2);
  });

  it("세션이 멈춘 그 사이에 끝난 단계는 멈추기 전에 넘기고 알림을 바로 낸다", () => {
    const { result, session, alarm, onStartBreak, onResumeSession } = setup();
    act(() => result.current.open("pomodoro"));
    act(() => result.current.changeSettings({ focusMin: 1, breakMin: 1 }));
    act(() => result.current.pressPrimary());
    advance(59_900);

    // 다음 틱 전에 벽시계만 넘어간 순간 세션이 멈춘 상황이다.
    act(() => {
      vi.setSystemTime(Date.now() + 200);
    });
    session(BACKGROUND);

    expect(alarm.play).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith("heavy");
    expect(result.current.mode?.phase).toBe("break");
    expect(result.current.remainingMs).toBe(59_900);
    expect(result.current.primaryLabel).toBe("계속");
    // 사용자가 떠나 있는 동안 세션을 휴식으로 바꾸지 않는다.
    expect(onStartBreak).not.toHaveBeenCalled();

    advance(30_000);
    expect(result.current.remainingMs).toBe(59_900);

    act(() => result.current.pressPrimary());
    expect(onStartBreak).toHaveBeenCalledTimes(1);
    expect(onResumeSession).not.toHaveBeenCalled();
  });

  it("집중 단계에서 진행·일시정지 중일 때만 비집중으로 본다", () => {
    const { result, session } = setup();
    act(() => result.current.open("pomodoro"));
    act(() => result.current.changeSettings({ focusMin: 1, breakMin: 1 }));
    session(AWAY);
    expect(result.current.distracted).toBe(false);

    act(() => result.current.pressPrimary());
    expect(result.current.distracted).toBe(true);
    act(() => result.current.pressPrimary());
    expect(result.current.distracted).toBe(true);
    act(() => result.current.pressPrimary());

    advance(60_000);
    expect(result.current.mode?.phase).toBe("break");
    expect(result.current.distracted).toBe(false);

    session(FOCUS);
    advance(60_000);
    expect(result.current.mode?.phase).toBe("focus");
    expect(result.current.distracted).toBe(false);
    session(AWAY);
    expect(result.current.distracted).toBe(true);
  });

  it("세션이 끝나면 모드를 비우고 휴식도 끝낸다", () => {
    const { result, session, alarm, onEndBreak } = setup();
    act(() => result.current.open("pomodoro"));
    act(() => result.current.changeSettings({ focusMin: 1, breakMin: 1 }));
    act(() => result.current.pressPrimary());
    advance(60_000);
    session(BREAK);

    session(BREAK, false);
    expect(result.current.mode).toBeNull();
    expect(onEndBreak).toHaveBeenCalledTimes(1);

    advance(120_000);
    expect(alarm.play).toHaveBeenCalledTimes(1);
  });

  it("언마운트하면 알림음을 정리한다", () => {
    const { unmount, alarm } = setup();
    unmount();
    expect(alarm.dispose).toHaveBeenCalledTimes(1);
  });
});
