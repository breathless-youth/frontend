import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Toaster } from "@/components/ui/sonner";
import { readMeasureMode, writeMeasureMode } from "@/features/measure-mode/measureMode";
import { createMockCameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import type * as Amplitude from "@/lib/amplitude";
import i18n from "@/lib/i18n";
import { requestSessionStart } from "@/lib/sessionStart";

import { writePcSessionMarker } from "../pcSessionMarker";
import { usePcSession } from "../usePcSession";

vi.mock("@/lib/sessionStart", () => ({
  requestSessionStart: vi.fn(async (_userId: number | null, open: () => void) => {
    open();
    return "web";
  }),
}));
const camera = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@/features/study-session/adapters/mediaStreamCamera", () => ({
  openCameraForSession: camera.open,
}));
vi.mock("../loadPcStudySession", () => ({ loadPcStudySession: vi.fn(async () => ({})) }));
const analytics = vi.hoisted(() => ({ tapped: vi.fn() }));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackFocusStartTapped: analytics.tapped,
}));

function setup(pc = true) {
  return renderHook(() => usePcSession(7, pc), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <>
        {children}
        <Toaster />
      </>
    ),
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  toast.dismiss();
  vi.clearAllMocks();
});

describe("usePcSession 시작", () => {
  it("관리 모드는 카메라를 먼저 열어 보고 열리면 그 카메라로 세션을 연다", async () => {
    writeMeasureMode("camera");
    const adapter = createMockCameraAdapter();
    camera.open.mockResolvedValue(adapter);
    const { result } = setup();

    await act(() => result.current.start(3));

    expect(result.current.request).toMatchObject({ resume: false, subjectId: 3, camera: adapter });
    expect(requestSessionStart).toHaveBeenCalledWith(7, expect.any(Function), { subjectId: 3 });
  });

  it("카메라가 열리지 않으면 세션을 열지 않고, 자율 모드로 시작을 누르면 카메라 없이 연다", async () => {
    writeMeasureMode("camera");
    camera.open.mockResolvedValue(null);
    const { result } = setup();

    await act(() => result.current.start(null));

    expect(result.current.request).toBeNull();
    expect(requestSessionStart).not.toHaveBeenCalled();
    expect(
      await screen.findByText(i18n.t("desktop:session.cameraUnavailable")),
    ).toBeInTheDocument();

    // sonner 토스트는 누름 시작에 포인터 캡처를 걸어 jsdom에서 터지므로 클릭만 보낸다.
    fireEvent.click(screen.getByRole("button", { name: i18n.t("desktop:session.startTimer") }));

    await waitFor(() => expect(result.current.request).toMatchObject({ resume: false }));
    expect(result.current.request?.camera).toBeUndefined();
    expect(readMeasureMode()).toBe("timer");
    expect(camera.open).toHaveBeenCalledTimes(1);
    // 사용자는 공부 시작을 한 번 눌렀으므로 토스트로 다시 시작해도 시작 계측은 한 번이다.
    expect(analytics.tapped).toHaveBeenCalledTimes(1);
  });

  it("자율 모드는 카메라를 열어 보지 않고 바로 연다", async () => {
    writeMeasureMode("timer");
    const { result } = setup();

    await act(() => result.current.start(null));

    expect(camera.open).not.toHaveBeenCalled();
    expect(result.current.request).toMatchObject({ resume: false });
    expect(requestSessionStart).toHaveBeenCalledWith(7, expect.any(Function), {});
  });

  it("옛 세션 마감이 실패하면 열어 본 카메라를 닫고 실패를 알린다", async () => {
    writeMeasureMode("camera");
    const adapter = createMockCameraAdapter();
    await adapter.start();
    camera.open.mockResolvedValue(adapter);
    vi.mocked(requestSessionStart).mockRejectedValueOnce(new Error("account changed"));
    const { result } = setup();

    await expect(act(() => result.current.start(null))).rejects.toThrow("account changed");

    expect(adapter.isRunning).toBe(false);
    expect(result.current.request).toBeNull();
  });

  it("세션을 닫으면 넘긴 카메라도 닫는다", async () => {
    writeMeasureMode("camera");
    const adapter = createMockCameraAdapter();
    await adapter.start();
    camera.open.mockResolvedValue(adapter);
    const { result } = setup();
    await act(() => result.current.start(null));

    act(() => result.current.end());

    expect(result.current.request).toBeNull();
    expect(adapter.isRunning).toBe(false);
  });
});

describe("usePcSession 이어 가기", () => {
  it("이 탭에 같은 계정의 세션 표시가 있으면 이어 가기 요청으로 시작한다", () => {
    writePcSessionMarker(7);

    const { result } = setup();

    expect(result.current.request).toEqual({ key: 0, resume: true });
  });

  it("다른 계정의 표시나 PC가 아닌 화면에서는 이어 가지 않는다", () => {
    writePcSessionMarker(8);
    expect(setup().result.current.request).toBeNull();

    writePcSessionMarker(7);
    expect(setup(false).result.current.request).toBeNull();
  });

  it("표시가 없으면 서버에 진행 기록이 있어도 열지 않는다", () => {
    const { result } = setup();

    expect(result.current.request).toBeNull();
  });
});

describe("usePcSession 시작 중 떠나기", () => {
  it("권한 창을 기다리는 사이 홈을 떠나면 열린 카메라를 닫고 세션을 열지 않는다", async () => {
    writeMeasureMode("camera");
    const adapter = createMockCameraAdapter();
    await adapter.start();
    let grant: (value: typeof adapter) => void = () => {};
    camera.open.mockReturnValue(new Promise((resolve) => (grant = resolve)));
    const { result, unmount } = setup();

    let started: Promise<void> = Promise.resolve();
    act(() => {
      started = result.current.start(null);
    });
    await waitFor(() => expect(camera.open).toHaveBeenCalled());
    unmount();
    await act(async () => {
      grant(adapter);
      await started;
    });

    expect(adapter.isRunning).toBe(false);
    expect(requestSessionStart).not.toHaveBeenCalled();
  });

  it("옛 세션 마감을 기다리는 사이 홈을 떠나면 카메라를 닫고 세션을 넘기지 않는다", async () => {
    writeMeasureMode("camera");
    const adapter = createMockCameraAdapter();
    await adapter.start();
    const stop = vi.spyOn(adapter, "stop");
    camera.open.mockResolvedValue(adapter);
    let finishClose: () => void = () => {};
    const openRoom = vi.fn();
    vi.mocked(requestSessionStart).mockImplementationOnce(
      (_userId, open) =>
        new Promise((resolve) => {
          finishClose = () => {
            openRoom();
            open();
            resolve("web");
          };
        }),
    );
    const { result, unmount } = setup();

    let started: Promise<void> = Promise.resolve();
    act(() => {
      started = result.current.start(null);
    });
    await waitFor(() => expect(requestSessionStart).toHaveBeenCalled());
    unmount();
    expect(adapter.isRunning).toBe(false);
    await act(async () => {
      finishClose();
      await started;
    });

    expect(openRoom).toHaveBeenCalledTimes(1);
    // 떠난 뒤에는 세션을 넘기지 않아 마지막으로 그린 요청이 비어 있고 카메라를 다시 닫지도 않는다.
    expect(result.current.request).toBeNull();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("시작을 두 번 눌러도 카메라와 세션은 한 번만 연다", async () => {
    writeMeasureMode("camera");
    camera.open.mockResolvedValue(createMockCameraAdapter());
    const { result } = setup();

    await act(async () => {
      await Promise.all([result.current.start(null), result.current.start(null)]);
    });

    expect(camera.open).toHaveBeenCalledTimes(1);
    expect(requestSessionStart).toHaveBeenCalledTimes(1);
    expect(result.current.request?.key).toBe(1);
  });
});

describe("usePcSession 카메라 넘기기", () => {
  it("세션에 넘긴 카메라는 공부하는 동안 닫지 않고 세션을 닫을 때 닫는다", async () => {
    writeMeasureMode("camera");
    const adapter = createMockCameraAdapter();
    await adapter.start();
    const stop = vi.spyOn(adapter, "stop");
    camera.open.mockResolvedValue(adapter);
    const { result, rerender } = setup();

    await act(() => result.current.start(null));
    rerender();
    rerender();

    expect(result.current.request?.camera).toBe(adapter);
    expect(stop).not.toHaveBeenCalled();

    act(() => result.current.end());

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
