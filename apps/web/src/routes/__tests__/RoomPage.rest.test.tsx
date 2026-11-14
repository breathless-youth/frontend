import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { __resetNativePushPermissionForTests } from "@/lib/nativePushPermission";
import { __resetRestNotificationForTests } from "@/lib/restNotificationCapability";

import { RoomPage } from "../RoomPage";

/**
 * 일시정지 휴식 화면의 RoomPage 연결만 본다.
 * 화면 안 시간·알림 규칙은 `SessionRestOverlay.test.tsx`가 본다.
 */
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: null }),
}));

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

vi.mock("@/lib/subjectApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listSubjects: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock("@/routes/lazyRoutes", () => ({ prefetchResultPage: vi.fn() }));

const trackSessionRestAlarmFired = vi.hoisted(() => vi.fn());
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  trackSessionRestAlarmFired,
}));

function renderRoom(path = "/room/7?userId=1") {
  window.history.replaceState(null, "", path);
  __resetRestNotificationForTests();
  __resetNativePushPermissionForTests();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const overlay = () => screen.queryByTestId("session-rest-overlay");

describe("RoomPage 일시정지 휴식 화면", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("공부 중에는 없고, 일시정지하면 뜨고 다시 시작하면 사라진다", async () => {
    renderRoom();
    expect(overlay()).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));
    expect(overlay()).toBeInTheDocument();
    expect(screen.getByText("쉬는 중")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "휴식 알림" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "다시 시작" }));
    expect(overlay()).toBeNull();
  });

  it("휴식 중에는 가려진 머리 줄과 시계를 누를 수 없고 하단 바만 남는다", async () => {
    renderRoom();
    const more = () => screen.getByRole("button", { name: "더보기" });
    expect(more().closest("[inert]")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));

    expect(more().closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("status").closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "다시 시작" }).closest("[inert]")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "다시 시작" }));
    expect(more().closest("[inert]")).toBeNull();
  });

  it("앱을 나갔다 돌아와도 일시정지 동안 휴식 화면이 보인다", () => {
    renderRoom();

    act(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(overlay()).toBeInTheDocument();
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("OS 알림을 예약할 수 없는 구버전 앱에서는 알림 말풍선을 숨긴다", async () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    renderRoom();

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));

    expect(overlay()).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "휴식 알림" })).toBeNull();
  });

  it("앱에서 휴식 알림을 고르면 OS 알림을 예약하고, 다시 시작하면 거둔다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    renderRoom("/room/7?userId=1&restNotify=1");
    const sent = () => postMessage.mock.calls.map(([raw]) => JSON.parse(raw as string));

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    fireEvent.click(screen.getByRole("button", { name: "5분 휴식 후 알림" }));

    const scheduled = sent().find((message) => message.type === "schedule-rest-notification");
    expect(scheduled).toMatchObject({
      id: "study-rest",
      title: "5분 휴식이 끝났어요",
      body: "다시 공부를 시작할 시간이에요",
    });
    expect(scheduled.fireAtMs).toBeGreaterThan(Date.now() + 299_000);

    fireEvent.click(screen.getByRole("button", { name: "다시 시작" }));

    expect(sent()).toContainEqual(
      expect.objectContaining({ type: "cancel-rest-notification", id: "study-rest" }),
    );
  });

  it("알림 권한을 물을 수 있는 앱이면 처음 알림을 고를 때 한 번만 묻는다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    renderRoom("/room/7?userId=1&restNotify=1&pushPermission=1");
    const asks = () =>
      postMessage.mock.calls.filter(
        ([raw]) => JSON.parse(raw as string).type === "request-push-permission",
      ).length;

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    expect(asks()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "5분 휴식 후 알림" }));
    fireEvent.click(screen.getByRole("button", { name: "10분 휴식 후 알림" }));

    expect(asks()).toBe(1);
  });

  it("알림을 고르지 않은 휴식이 끝나도 남아 있을지 모르는 OS 알림을 거둔다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    renderRoom("/room/7?userId=1&restNotify=1");
    const sent = () => postMessage.mock.calls.map(([raw]) => JSON.parse(raw as string));

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    fireEvent.click(screen.getByRole("button", { name: "다시 시작" }));

    expect(sent()).toContainEqual(
      expect.objectContaining({ type: "cancel-rest-notification", id: "study-rest" }),
    );
  });

  it("쉬는 동안 시계는 서서히 사라지고 다시 시작하면 돌아온다", async () => {
    renderRoom();
    expect(screen.getByRole("status").closest(".transition-opacity")).not.toHaveClass("opacity-0");

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));
    expect(screen.getByRole("status").closest(".transition-opacity")).toHaveClass("opacity-0");

    await userEvent.click(screen.getByRole("button", { name: "다시 시작" }));
    expect(screen.getByRole("status").closest(".transition-opacity")).not.toHaveClass("opacity-0");
  });

  describe("늦게 돌아왔을 때 OS 알림이 대신 울렸다고 볼지", () => {
    // 권한 답은 약속을 거쳐 화면을 다시 그리므로 비동기 act 안에서 보낸다.
    const answerPermission = (status: "granted" | "denied") =>
      act(async () => {
        const receive = (globalThis as Record<string, unknown>)[NATIVE_MESSAGE_ENTRY];
        (receive as (raw: string) => void)(
          JSON.stringify({ type: "push-permission-result", status, atMs: Date.now() }),
        );
      });

    async function chooseAlarmThenReturnLate(status: "granted" | "denied") {
      vi.useFakeTimers();
      vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
      renderRoom("/room/7?userId=1&restNotify=1&pushPermission=1");
      fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
      fireEvent.click(screen.getByRole("button", { name: "5분 휴식 후 알림" }));
      await answerPermission(status);
      vi.setSystemTime(Date.now() + 420_000);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }

    it("알림 권한을 허용한 앱이면 OS 알림이 울린 것으로 기록한다", async () => {
      await chooseAlarmThenReturnLate("granted");

      expect(trackSessionRestAlarmFired).toHaveBeenCalledWith({ channel: "os" });
    });

    it("알림 권한을 거부한 앱이면 돌아왔을 때 앱 안에서 알린다", async () => {
      await chooseAlarmThenReturnLate("denied");

      expect(trackSessionRestAlarmFired).toHaveBeenCalledWith({ channel: "in_app" });
    });
  });
});
