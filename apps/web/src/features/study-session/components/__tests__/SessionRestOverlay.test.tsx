import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionRestOverlay } from "../SessionRestOverlay";

const haptic = vi.hoisted(() => vi.fn());
vi.mock("@/lib/haptics", () => ({ haptic }));

const trackSessionRestAlarmFired = vi.hoisted(() => vi.fn());
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  trackSessionRestAlarmFired,
}));

const START = Date.UTC(2026, 10, 14, 1, 0, 0);

function setup(over: Partial<Parameters<typeof SessionRestOverlay>[0]> = {}) {
  const alarm = { prime: vi.fn(), play: vi.fn(), dispose: vi.fn() };
  const onAlarmChange = vi.fn();
  const view = render(
    <SessionRestOverlay
      pausedSinceMs={START}
      showAlarms
      osNotifiable
      alarm={alarm}
      onAlarmChange={onAlarmChange}
      {...over}
    />,
  );
  return { ...view, alarm, onAlarmChange };
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** 앱을 나갔다 돌아온 것처럼 화면을 숨겼다 다시 보인다. */
function hideAndShowPage() {
  for (const state of ["hidden", "visible"] as const) {
    Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  }
  Reflect.deleteProperty(document, "visibilityState");
}

const timer = () => screen.getByRole("timer");
const option = (name: string) => screen.getByRole("button", { name });

describe("SessionRestOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START + 161_000);
  });
  afterEach(() => {
    vi.useRealTimers();
    haptic.mockClear();
    trackSessionRestAlarmFired.mockClear();
  });

  it("쉬는 중 라벨과 일시정지부터 흐른 시간을 보이고 1초마다 올린다", () => {
    setup();

    expect(screen.getByText("쉬는 중")).toBeInTheDocument();
    expect(timer()).toHaveTextContent("02:41");
    advance(1000);
    expect(timer()).toHaveTextContent("02:42");
    expect(option("알림 없음")).toHaveAttribute("aria-pressed", "true");
  });

  it("알림을 고르면 고른 시점부터 남은 시간을 거꾸로 세고 예약을 알린다", () => {
    const { onAlarmChange, alarm } = setup();

    fireEvent.click(option("5분 휴식 후 알림"));

    expect(screen.getByText("쉬는 중 · 5분 뒤 알려줄게요")).toBeInTheDocument();
    expect(timer()).toHaveTextContent("05:00");
    expect(option("5분 휴식 후 알림")).toHaveAttribute("aria-pressed", "true");
    expect(onAlarmChange).toHaveBeenLastCalledWith({ minutes: 5, fireAtMs: Date.now() + 300_000 });
    expect(alarm.prime).toHaveBeenCalled();
    advance(28_000);
    expect(timer()).toHaveTextContent("04:32");

    fireEvent.click(option("알림 없음"));
    expect(onAlarmChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("쉬는 중")).toBeInTheDocument();
  });

  it("시간이 되면 소리와 진동으로 알리고 휴식이 끝났다고 보이며 말풍선은 알림 없음으로 돌아간다", () => {
    const { alarm, onAlarmChange } = setup();
    fireEvent.click(option("5분 휴식 후 알림"));

    advance(300_000);

    expect(alarm.play).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalled();
    expect(trackSessionRestAlarmFired).toHaveBeenCalledWith({ channel: "in_app" });
    expect(screen.getByText("휴식이 끝났어요")).toBeInTheDocument();
    // 일시정지부터 센 총 휴식 시간으로 돌아간다: 2:41 + 5:00
    expect(timer()).toHaveTextContent("07:41");
    expect(option("알림 없음")).toHaveAttribute("aria-pressed", "true");
    expect(onAlarmChange).toHaveBeenLastCalledWith(null);
  });

  it("앱을 나가 있다 돌아와 이미 지난 알림은 소리 없이 끝났다고만 보이고 OS 알림으로 기록한다", () => {
    const { alarm } = setup({ osNotifiable: true });
    fireEvent.click(option("5분 휴식 후 알림"));
    hideAndShowPage();

    // 웹뷰가 멈춰 있던 동안 시계만 흘렀다.
    vi.setSystemTime(Date.now() + 420_000);
    advance(1000);

    expect(alarm.play).not.toHaveBeenCalled();
    expect(trackSessionRestAlarmFired).toHaveBeenCalledWith({ channel: "os" });
    expect(screen.getByText("휴식이 끝났어요")).toBeInTheDocument();
  });

  it("보던 화면을 서서히 흐리고 휴식 내용은 늦게 띄우며, 움직임 줄이기에서는 전환을 끈다", () => {
    setup();

    const overlay = screen.getByTestId("session-rest-overlay");
    const content = timer().parentElement!;
    const bubbles = screen.getByRole("group", { name: "휴식 알림" });
    expect(overlay.className).toContain("animate-[session-rest-veil_500ms_ease-out]");
    for (const layer of [content, bubbles]) {
      expect(layer.className).toContain("animate-[coach-fade-in_350ms_ease-out_225ms_both]");
    }
    for (const layer of [overlay, content, bubbles]) {
      expect(layer).toHaveClass("motion-reduce:animate-none");
    }
  });

  it("앱이 계속 앞에 있었다면 확인이 늦어도 OS 알림이 아니라 앱 안에서 알린다", () => {
    // 화면이 버벅여 확인이 늦었을 뿐이면 앞에 있는 앱에는 OS 알림이 뜨지 않는다.
    const { alarm } = setup({ osNotifiable: true });
    fireEvent.click(option("5분 휴식 후 알림"));

    vi.setSystemTime(Date.now() + 303_000);
    advance(250);

    expect(alarm.play).toHaveBeenCalledTimes(1);
    expect(trackSessionRestAlarmFired).toHaveBeenCalledWith({ channel: "in_app" });
  });

  it("OS 알림을 보낼 수 없으면 늦게 돌아와도 한 번 소리와 진동으로 알리고 앱 안 알림으로 기록한다", () => {
    // 브라우저이거나 알림 권한이 없으면 앱을 나가 있는 동안 아무것도 울리지 않았다.
    const { alarm } = setup({ osNotifiable: false });
    fireEvent.click(option("5분 휴식 후 알림"));

    vi.setSystemTime(Date.now() + 420_000);
    advance(1000);

    expect(alarm.play).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalled();
    expect(trackSessionRestAlarmFired).toHaveBeenCalledWith({ channel: "in_app" });
    expect(screen.getByText("휴식이 끝났어요")).toBeInTheDocument();
  });

  it("말풍선을 보일 수 없는 앱에서는 숨긴다", () => {
    setup({ showAlarms: false });

    expect(screen.queryByRole("group", { name: "휴식 알림" })).toBeNull();
    expect(screen.getByText("쉬는 중")).toBeInTheDocument();
  });

  it("고른 알림이 없어도 닫힐 때 알림 취소를 알린다", () => {
    // 웹뷰가 다시 떠서 화면이 고른 알림을 잊어도 앞서 예약한 OS 알림은 남아 있을 수 있다.
    const { unmount, onAlarmChange } = setup();

    unmount();

    expect(onAlarmChange).toHaveBeenCalledWith(null);
  });

  it("닫히면 예약한 알림을 거둔다", () => {
    const { unmount, onAlarmChange, alarm } = setup();
    fireEvent.click(option("10분 휴식 후 알림"));

    unmount();

    expect(onAlarmChange).toHaveBeenLastCalledWith(null);
    expect(alarm.dispose).toHaveBeenCalled();
  });
});
