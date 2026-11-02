import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import type { PushPermissionResult } from "@/lib/nativePushPermission";
import { onboardingRecord } from "@/features/onboarding/onboardingGate";
import { OnboardingPage } from "@/routes/OnboardingPage";

const mocks = vi.hoisted(() => ({
  requestPushPermission: vi.fn((): Promise<PushPermissionResult> => Promise.resolve("granted")),
  signalLaunchReady: vi.fn(),
  trackOnboardingStepViewed: vi.fn(),
  trackOnboardingNotificationResult: vi.fn(),
  trackOnboardingCompleted: vi.fn(),
  trackMetaTutorialCompleted: vi.fn(),
}));

vi.mock("@/lib/nativePushPermission", () => ({
  requestPushPermission: mocks.requestPushPermission,
}));
vi.mock("@/lib/launchReady", () => ({ signalLaunchReady: mocks.signalLaunchReady }));
vi.mock("@/lib/metaAppEvents", () => ({
  trackMetaTutorialCompleted: mocks.trackMetaTutorialCompleted,
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackOnboardingStepViewed: mocks.trackOnboardingStepViewed,
  trackOnboardingNotificationResult: mocks.trackOnboardingNotificationResult,
  trackOnboardingCompleted: mocks.trackOnboardingCompleted,
}));

function HomeProbe() {
  const location = useLocation();
  return <div data-testid="home-stub">{location.pathname + location.search}</div>;
}

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={["/onboarding?userId=7"]}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/home" element={<HomeProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function heading(): string {
  return screen.getByRole("heading", { level: 1 }).textContent ?? "";
}

async function advanceTo(step: number) {
  const user = userEvent.setup();
  for (let i = 1; i < step; i++) {
    await user.click(screen.getByRole("button", { name: "다음" }));
  }
  return user;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe("OnboardingPage", () => {
  it("마운트되면 앱에 시작 신호를 보내 스플래시를 걷게 한다", () => {
    renderOnboarding();

    expect(mocks.signalLaunchReady).toHaveBeenCalled();
  });

  it("1단계는 자동 타이머 소개이고 이전 버튼이 없다", () => {
    renderOnboarding();

    expect(heading()).toContain("순공 시간을 자동으로 측정해요");
    expect(screen.queryByRole("button", { name: "이전" })).not.toBeInTheDocument();
    expect(mocks.trackOnboardingStepViewed).toHaveBeenCalledWith("auto_timer");
  });

  it("다음을 누르면 자동 기록, 그룹 스터디, 맞춤 알림 순서로 넘어가고 단계마다 노출을 보낸다", async () => {
    renderOnboarding();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(heading()).toContain("플래너에 자동으로 기록돼요");

    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(heading()).toContain("함께 집중할 수 있어요");

    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(heading()).toContain("맞춤 알림을 보내줄게요");
    expect(screen.getByRole("button", { name: "알림 받기" })).toBeInTheDocument();

    expect(mocks.trackOnboardingStepViewed.mock.calls.map(([step]) => step)).toEqual([
      "auto_timer",
      "auto_record",
      "group_study",
      "notification",
    ]);
  });

  it("이전을 누르면 앞 단계로 돌아간다", async () => {
    renderOnboarding();
    const user = await advanceTo(3);

    await user.click(screen.getByRole("button", { name: "이전" }));

    expect(heading()).toContain("플래너에 자동으로 기록돼요");
  });

  it("알림 받기는 권한을 요청하고 결과를 보낸 뒤 준비 완료로 넘어간다", async () => {
    mocks.requestPushPermission.mockResolvedValueOnce("denied");
    renderOnboarding();
    const user = await advanceTo(4);

    await user.click(screen.getByRole("button", { name: "알림 받기" }));

    // 권한 응답 뒤 다음 화면으로 넘어가는 것은 비동기라 끝날 때까지 기다린다.
    await waitFor(() => expect(heading()).toContain("준비가 끝났어요"));
    expect(mocks.requestPushPermission).toHaveBeenCalledTimes(1);
    expect(mocks.trackOnboardingNotificationResult).toHaveBeenCalledWith("denied");
    expect(mocks.trackOnboardingStepViewed).toHaveBeenLastCalledWith("ready");
  });

  it("권한 응답을 기다리는 동안 알림 받기를 다시 눌러도 요청은 한 번이다", async () => {
    let answer: (value: PushPermissionResult) => void = () => {};
    mocks.requestPushPermission.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    renderOnboarding();
    const user = await advanceTo(4);

    await user.click(screen.getByRole("button", { name: "알림 받기" }));
    await user.click(screen.getByRole("button", { name: "알림 받기" }));
    await act(async () => answer("granted"));

    expect(mocks.requestPushPermission).toHaveBeenCalledTimes(1);
    expect(heading()).toContain("준비가 끝났어요");
  });

  it("권한 응답을 기다리는 동안 이전을 눌러도 4단계에 머문다 — 응답이 와서 단계를 건너뛰지 않게", async () => {
    let answer: (value: PushPermissionResult) => void = () => {};
    mocks.requestPushPermission.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    renderOnboarding();
    const user = await advanceTo(4);
    const fourth = heading();

    await user.click(screen.getByRole("button", { name: "알림 받기" }));
    await user.click(screen.getByRole("button", { name: "이전" }));
    expect(heading()).toBe(fourth);

    await act(async () => answer("granted"));
    expect(heading()).toContain("준비가 끝났어요");
  });

  it("시작하기를 누르면 기록을 남기고 완료 이벤트를 보낸 뒤 쿼리를 유지한 채 홈으로 간다", async () => {
    renderOnboarding();
    const user = await advanceTo(4);
    await user.click(screen.getByRole("button", { name: "알림 받기" }));

    await user.click(screen.getByRole("button", { name: "시작하기" }));

    expect(await screen.findByTestId("home-stub")).toHaveTextContent("/home?userId=7");
    expect(onboardingRecord(7)).toBe("settled");
    expect(mocks.trackOnboardingCompleted).toHaveBeenCalledTimes(1);
    expect(mocks.trackMetaTutorialCompleted).toHaveBeenCalledTimes(1);
  });
});
