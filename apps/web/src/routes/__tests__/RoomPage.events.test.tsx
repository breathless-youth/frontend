import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeFaceMaskOn } from "@/features/live-room/faceMaskSettings";
import { writeMeasureMode } from "@/features/measure-mode/measureMode";
import {
  trackCameraPipExpanded,
  trackCameraPipShrunk,
  trackSessionMoreMenuItemSelected,
  trackSessionMoreMenuOpened,
  trackSessionSimpleModeToggled,
  trackStudySessionEnded,
} from "@/lib/amplitude";
import { postToNative } from "@/lib/bridge";
import type * as BridgeModule from "@/lib/bridge";
import { PROCTOR_SPACE } from "@/test/spaceFixtures";
import { RoomPage } from "../RoomPage";

/**
 * v3 세션 화면에 옮긴 dev 계측·앱 연결을 본다.
 * 더보기 메뉴와 심플 모드 이벤트, 작은 창 표시 시간, 잠금화면 공부 표시, 도움말 중 세로 고정이다.
 * 각 계측 그릇과 브리지 훅의 규칙은 자기 단위 테스트가 본다.
 */
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: null }),
}));

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

vi.mock("@/routes/lazyRoutes", () => ({ prefetchResultPage: vi.fn() }));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  trackCameraPipExpanded: vi.fn(),
  trackCameraPipShrunk: vi.fn(),
  trackSessionMoreMenuItemSelected: vi.fn(),
  trackSessionMoreMenuOpened: vi.fn(),
  trackSessionSimpleModeToggled: vi.fn(),
  trackStudySessionEnded: vi.fn(),
}));

// 보낸 메시지만 엿보고 브라우저 단독 모드의 동작은 그대로 둔다.
vi.mock("@/lib/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof BridgeModule>();
  return { ...actual, postToNative: vi.fn(actual.postToNative) };
});

// 잠금화면 표시를 지원하는 앱으로 띄운 것처럼 둔다.
vi.mock("@/lib/liveActivityCapability", () => ({ hasLiveActivity: () => true }));

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={["/room/7?userId=1"]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const sentOf = (type: string) =>
  vi
    .mocked(postToNative)
    .mock.calls.map(([message]) => message)
    .filter((message) => message.type === type);

async function pickMenuItem(name: string) {
  await userEvent.click(screen.getByRole("button", { name: "더보기" }));
  await userEvent.click(screen.getByRole("menuitem", { name }));
}

describe("RoomPage dev 계측·앱 연결", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ version: 1, sounds: [] }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it.each([
    ["카메라 전환", "flip_camera"],
    ["도움말 보기", "help"],
    ["배경 설정", "background"],
    ["스톱워치", "stopwatch"],
    ["타이머", "timer"],
    ["공부 시간으로 보기", "clock_view"],
  ] as const)("더보기를 열고 %s 항목을 고르면 메뉴 이벤트를 보낸다", async (name, item) => {
    renderRoom();

    await pickMenuItem(name);

    expect(trackSessionMoreMenuOpened).toHaveBeenCalledOnce();
    expect(trackSessionMoreMenuItemSelected).toHaveBeenCalledExactlyOnceWith({ item });
  });

  it("심플 모드로 들어갈 때만 어느 화면에서 왔는지 싣는다", async () => {
    renderRoom();
    const toggle = screen.getByRole("button", { name: "심플 모드 전환" });

    await userEvent.click(toggle);
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole("button", { name: "내 화면 크게 보기" }));
    await userEvent.click(toggle);

    expect(vi.mocked(trackSessionSimpleModeToggled).mock.calls).toEqual([
      [true, "pip"],
      [false],
      [true, "expanded"],
    ]);
  });

  it("카메라 없는 세션은 심플 모드로 들어갈 때 출발 화면을 싣지 않는다", async () => {
    writeMeasureMode("timer");
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));

    expect(vi.mocked(trackSessionSimpleModeToggled).mock.calls).toEqual([[true, undefined]]);
  });

  it("작은 창을 키우고 줄일 때 실제로 바뀐 경우에만 이벤트를 보낸다", async () => {
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "내 화면 크게 보기" }));
    expect(trackCameraPipExpanded).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "작게 보기" }));
    expect(trackCameraPipShrunk).toHaveBeenCalledExactlyOnceWith({
      expandedSec: expect.any(Number),
    });

    // 심플 모드로 들어가는 것은 줄이기가 아니다.
    await userEvent.click(screen.getByRole("button", { name: "내 화면 크게 보기" }));
    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
    expect(trackCameraPipShrunk).toHaveBeenCalledOnce();
  });

  it("세션이 끝나면 화면 표시 기록과 공간을 종료 이벤트에 싣고, 얼굴 가림은 켜 둔 값이 남아 있어도 끔으로 싣는다", async () => {
    localStorage.setItem("focusmakers.timerBackground", JSON.stringify(PROCTOR_SPACE));
    writeFaceMaskOn("single", true);
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "내 화면 크게 보기" }));

    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "공부 종료" }),
    );

    await waitFor(() => expect(trackStudySessionEnded).toHaveBeenCalledOnce());
    expect(vi.mocked(trackStudySessionEnded).mock.calls[0]?.[0].display).toEqual({
      pipSec: expect.any(Number),
      expandedSec: expect.any(Number),
      simpleSec: expect.any(Number),
      pipExpandCount: 1,
      spaceKind: "space",
      spaceItem: { itemCode: "SPACE_PROCTOR", videoMode: "WATCH" },
      faceMask: false,
    });
  });

  it("공부 중이면 잠금화면 공부 표시를 보내고 일시정지하면 멈춘 상태로 다시 보낸다", async () => {
    renderRoom();

    expect(sentOf("live-activity")).toEqual([
      {
        type: "live-activity",
        session: { mode: "camera", subject: null, state: "running", elapsedSec: 0 },
        atMs: expect.any(Number),
      },
    ]);

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));

    expect(sentOf("live-activity").at(-1)).toMatchObject({
      session: { mode: "camera", state: "paused" },
    });
  });

  it("카메라 없는 세션은 잠금화면 표시에 타이머 방식으로 보낸다", () => {
    writeMeasureMode("timer");
    renderRoom();

    expect(sentOf("live-activity").at(-1)).toMatchObject({ session: { mode: "timer" } });
  });

  it("도움말이 떠 있는 동안 세로로 묶고 닫으면 회전을 다시 푼다", async () => {
    renderRoom();
    vi.mocked(postToNative).mockClear();

    await pickMenuItem("도움말 보기");
    expect(sentOf("set-orientation").at(-1)).toMatchObject({ unlocked: false });

    fireEvent.keyDown(screen.getByRole("dialog", { name: "세션 도움말" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "세션 도움말" })).not.toBeInTheDocument();
    expect(sentOf("set-orientation").at(-1)).toMatchObject({ unlocked: true });
  });
});
