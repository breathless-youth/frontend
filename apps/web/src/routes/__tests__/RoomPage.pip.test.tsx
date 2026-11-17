import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  trackCameraPipExpanded,
  trackCameraPipShrunk,
  trackStudySessionEnded,
} from "@/lib/amplitude";
import { answerCameraPrompt } from "@/test/cameraPrompt";
import { RoomPage } from "../RoomPage";

/**
 * 내 카메라 작은 창(PiP)의 RoomPage 연결만 본다.
 * 키우기 움직임의 키프레임은 `cameraExpandMotion.test.ts`가 검증한다.
 * jsdom은 Web Animations가 없어 키우기·줄이기가 움직임 없이 바로 바뀐다.
 */
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: null }),
}));

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  trackCameraPipExpanded: vi.fn(),
  trackCameraPipShrunk: vi.fn(),
  trackStudySessionEnded: vi.fn(),
}));

function renderRoom(choice: "camera" | "simple" = "camera") {
  const view = render(
    <MemoryRouter initialEntries={["/room/7?userId=1"]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
  answerCameraPrompt(choice);
  return view;
}

const expandButton = () => screen.queryByRole("button", { name: "내 화면 크게 보기" });
const shrinkButton = () => screen.queryByRole("button", { name: "작게 보기" });
const cameraView = () => screen.getByRole("main").getAttribute("data-camera-view");

describe("RoomPage 작은 카메라 창", () => {
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

  it("카메라 켜기로 들어오면 작은 창으로 시작한다", () => {
    renderRoom();

    expect(expandButton()).toBeInTheDocument();
    expect(shrinkButton()).not.toBeInTheDocument();
    expect(cameraView()).toBe("pip");
  });

  it("작은 창을 누르면 화면 전체로 키우고 줄이기 버튼으로 돌아온다", async () => {
    renderRoom();

    await userEvent.click(expandButton()!);
    expect(cameraView()).toBe("expanded");
    expect(expandButton()).not.toBeInTheDocument();

    await userEvent.click(shrinkButton()!);
    expect(cameraView()).toBe("pip");
    expect(expandButton()).toBeInTheDocument();
  });

  it("키운 채 심플 모드로 갔다 돌아오면 작은 창이다", async () => {
    renderRoom();
    await userEvent.click(expandButton()!);

    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
    expect(cameraView()).toBe("hidden");
    expect(shrinkButton()).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
    expect(cameraView()).toBe("pip");
    expect(expandButton()).toBeInTheDocument();
  });

  it("심플 모드로 시작하면 작은 창이 없다", () => {
    renderRoom("simple");

    expect(expandButton()).not.toBeInTheDocument();
    expect(cameraView()).toBe("hidden");
  });

  it("작은 창은 회전 중에도 확대하지 않는다", () => {
    const { container } = renderRoom();

    act(() => {
      window.innerWidth = 402;
      window.innerHeight = 874;
      window.dispatchEvent(new Event("resize"));
    });
    act(() => {
      window.innerWidth = 874;
      window.innerHeight = 402;
      window.dispatchEvent(new Event("resize"));
    });

    const surface = container.querySelector('[data-session-surface="camera"]')!;
    expect(surface.className).not.toContain("scale-");
  });

  describe("키우기·줄이기 움직임 중 화면이 바뀌면", () => {
    /** 손으로 끝내기 전까지 진행 중인 움직임. finish만 끝 모양으로 건너뛰게 한다. */
    function stubCameraMotion() {
      const animations: { finish: () => void }[] = [];
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: 0, y: 0, width: 100, height: 100 }),
      );
      Object.defineProperty(HTMLElement.prototype, "animate", {
        configurable: true,
        value: () => {
          let done: () => void = () => {};
          const animation = {
            finished: new Promise<void>((resolve) => {
              done = resolve;
            }),
            finish: () => done(),
            cancel: () => {},
          };
          animations.push(animation);
          return animation;
        },
      });
      return animations;
    }

    function rotate() {
      act(() => {
        window.innerWidth = 402;
        window.innerHeight = 874;
        window.dispatchEvent(new Event("resize"));
      });
    }

    afterEach(() => {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
      vi.restoreAllMocks();
      window.innerWidth = 1024;
      window.innerHeight = 768;
    });

    it("키우는 중이면 바로 전체 화면으로 끝내고 다시 줄일 수 있다", async () => {
      const animations = stubCameraMotion();
      renderRoom();
      await userEvent.click(expandButton()!);
      expect(animations).toHaveLength(1);

      rotate();

      await userEvent.click(shrinkButton()!);
      expect(animations).toHaveLength(2);
    });

    it("줄이는 중이면 바로 작은 창으로 끝낸다", async () => {
      const animations = stubCameraMotion();
      renderRoom();
      await userEvent.click(expandButton()!);
      act(() => animations[0].finish());
      await userEvent.click(shrinkButton()!);
      expect(cameraView()).toBe("expanded");

      rotate();

      await waitFor(() => expect(cameraView()).toBe("pip"));
    });
  });

  it("작은 창 버튼은 탭 순서에서 더보기보다 앞이다", async () => {
    renderRoom();

    const names: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      await userEvent.tab();
      names.push(document.activeElement?.getAttribute("aria-label") ?? "");
    }
    expect(names).toContain("내 화면 크게 보기");
    expect(names.indexOf("내 화면 크게 보기")).toBeLessThan(names.indexOf("더보기"));
  });

  it("작은 창을 키우고 줄일 때 실제로 바뀐 경우에만 이벤트를 보낸다", async () => {
    renderRoom();

    await userEvent.click(expandButton()!);
    expect(trackCameraPipExpanded).toHaveBeenCalledOnce();

    await userEvent.click(shrinkButton()!);
    expect(trackCameraPipShrunk).toHaveBeenCalledExactlyOnceWith({
      expandedSec: expect.any(Number),
    });

    // 심플 모드로 들어가는 것은 줄이기가 아니다.
    await userEvent.click(expandButton()!);
    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
    expect(trackCameraPipShrunk).toHaveBeenCalledOnce();
  });

  it("세션이 끝나면 화면 표시 기록과 공간·얼굴 가림을 종료 이벤트에 싣는다", async () => {
    localStorage.setItem("focusmakers.timerBackground", '{"kind":"proctor"}');
    renderRoom();
    await userEvent.click(expandButton()!);

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
      spaceKind: "proctor",
      faceMask: false,
    });
  });
});
