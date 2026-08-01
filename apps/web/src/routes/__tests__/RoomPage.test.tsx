import type { StudySessionResponse } from "@focusmakers/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SUB_MINUTE_EXIT_DESCRIPTION } from "@/features/study-session/sessionCopy";
import { submitStudySession } from "@/features/study-session/submitStudySession";
import { RoomPage } from "../RoomPage";

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

/** 화면 꺼짐·백그라운드 전환을 jsdom에서 재현한다(Page Visibility API). */
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

/**
 * S4(공부 결과) 라우트 자리의 프로브.
 *
 * 실제 `ResultPage`를 끌어오지 않는다 — 여기서 검증할 것은 결과 화면의 렌더가 아니라
 * **RoomPage의 배선**(어느 경로로, 어떤 state를 들고 넘어가는가)이다. 결과 화면 자체는
 * `ResultPage.test.tsx`가 검증한다.
 */
function ResultRouteProbe() {
  const location = useLocation();
  const { sessions } = (location.state ?? {}) as { sessions?: StudySessionResponse[] };
  return (
    <div>
      <p>결과 라우트</p>
      <p>{location.pathname}</p>
      <p>{`전달된 세션: ${sessions?.map((session) => session.statDate).join(",") ?? "없음"}`}</p>
    </div>
  );
}

/** 홈 라우트 자리의 프로브 — 미달 종료의 이탈 경로를 관측한다. */
function HomeRouteProbe() {
  return <p>홈 라우트</p>;
}

function renderRoom(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/" element={<HomeRouteProbe />} />
        <Route path="/room/:id" element={<RoomPage />} />
        <Route path="/room/:id/result" element={<ResultRouteProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * 컨트롤 바 종료 버튼과 다이얼로그 확정 버튼은 **같은 이름**(`공부 종료`)을 갖는다 —
 * 실제 브라우저에서는 배경이 `inert`라 접근성 트리에 하나만 남지만 jsdom은 `inert`를
 * 접근성 계산에 반영하지 않으므로 테스트에서는 다이얼로그 안으로 범위를 좁힌다.
 */
function confirmExitButton() {
  return within(screen.getByRole("alertdialog")).getByRole("button", { name: "공부 종료" });
}

/** S3-7: 종료는 **2단계**다 — 컨트롤 바 → 확인 다이얼로그. */
async function endSession() {
  await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));
  await userEvent.click(confirmExitButton());
}

/** 가짜 타이머 구간용 — `userEvent`의 내부 지연 타이머를 피해 `fireEvent`로 직접 누른다. */
function endSessionSync() {
  fireEvent.click(screen.getByRole("button", { name: "공부 종료" }));
  fireEvent.click(confirmExitButton());
}

/**
 * 순공 1분을 채운 뒤 종료한다 — **S4로 가려면 필요한 전제**다.
 *
 * 2026-07-27 확정으로 순공 1분 미만 세션은 기록에 남지 않으므로, `RoomPage`가 S4 대신 미달
 * 안내(`SubMinuteEndNotice`)로 갈라 보낸다. 갓 입장해서 바로 끝내면 순공이 0초라 결과 화면에
 * 도달할 수 없다.
 *
 * 시간을 흘리는 데 가짜 타이머를 쓰고 클릭은 `fireEvent`로 한다(`userEvent`는 내부 지연 타이머가
 * 있어 가짜 타이머와 함께 쓰면 멈춘다). 마운트 시 만들어진 tick 인터벌은 진짜 타이머라 가짜
 * 시계로는 돌지 않지만 **문제가 되지 않는다** — 최종 집계는 인터벌이 아니라 `endAndSubmit`이
 * 종료 시각으로 직접 계산하고, 가짜 타이머가 `Date.now()`까지 함께 밀어 주기 때문이다.
 *
 * 이후 `findByText`가 폴링해야 하므로 반드시 진짜 타이머로 되돌린다.
 */
async function endSessionAfterMinute() {
  vi.useFakeTimers();
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    endSessionSync();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  } finally {
    vi.useRealTimers();
  }
}

/**
 * jsdom에는 `navigator.mediaDevices`가 없어 `RoomPage`가 주입하는 실제
 * `createMediaStreamCameraAdapter`는 항상 카메라 없이 시작한다(getUserMedia가 던지고
 * 어댑터가 삼킨다). 카메라가 실제로 켜졌을 때의 배선(전환 성공 등)을 검증하려면 이 테스트에서만
 * 하드웨어가 있는 것처럼 `navigator`를 스텁한다 — `mediaStreamCamera.test.ts`와 같은 패턴.
 */
function stubWorkingCamera(deviceKinds: string[] = ["videoinput", "videoinput"]) {
  // 트랙을 **실제로 들고 있는** 스트림을 준다 — `getTracks: () => []`로는 "멈추지 않고
  // 버려진 스트림"(카메라 누수)을 테스트가 감지할 방법이 없다.
  const opened: { stop: ReturnType<typeof vi.fn> }[] = [];
  const getUserMedia = vi.fn(async () => {
    const track = { stop: vi.fn() };
    opened.push(track);
    return { getTracks: () => [track] } as unknown as MediaStream;
  });
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia,
      enumerateDevices: vi.fn(async () => deviceKinds.map((kind) => ({ kind }))),
    },
  });
  return { getUserMedia, opened };
}

describe("RoomPage — S3-1 프리뷰 / S3-2 비집중", () => {
  // 모듈 스코프 mock이라 clearAllMocks 없이는 호출 기록이 테스트 간 누적된다.
  // unstubAllGlobals: 카메라 전환 테스트가 stubGlobal("navigator", ...)을 거는데,
  // 다른 테스트로 새지 않게 매번 원복한다(스텁한 적 없으면 no-op).
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("순공 타이머·총 공부 병기·프라이버시 캡션·컨트롤 바를 렌더링한다", () => {
    renderRoom("/room/7?userId=1");

    expect(screen.getByText("00:00:00")).toBeInTheDocument();
    expect(screen.getByText("총 00:00:00")).toBeInTheDocument();
    expect(screen.getByText("영상은 기기 안에서만 처리돼요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "일시정지" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "카메라 전환" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "공부 종료" })).toBeInTheDocument();
  });

  it("기본 상태는 집중이며 상태 필을 라이브 리전으로 알린다", () => {
    renderRoom("/room/7?userId=1");

    expect(screen.getByRole("status")).toHaveTextContent("집중 측정 중");
  });

  it("V1.0 싱글룸에는 방 개념이 없어 방 번호를 표시하지 않는다", () => {
    renderRoom("/room/7?userId=1");

    expect(screen.queryByText(/스터디룸/)).not.toBeInTheDocument();
    expect(screen.queryByText(/#7/)).not.toBeInTheDocument();
  });

  it("멀티룸 프라이버시 문구를 쓰지 않는다", () => {
    renderRoom("/room/7?userId=1");

    expect(screen.queryByText(/서버로 전송되지 않/)).not.toBeInTheDocument();
    expect(screen.queryByText(/다른 사람/)).not.toBeInTheDocument();
  });

  it("컨트롤 바 밖 탭으로 심플 모드를 토글한다", async () => {
    renderRoom("/room/7?userId=1");

    const tapLayer = screen.getByRole("button", { name: "심플 모드 전환" });
    expect(tapLayer).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(tapLayer);
    expect(screen.getByRole("button", { name: "심플 모드 전환" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("일시정지 버튼이 '다시 시작'으로 토글된다", async () => {
    renderRoom("/room/7?userId=1");

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));
    expect(screen.getByRole("button", { name: "다시 시작" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "다시 시작" }));
    expect(screen.getByRole("button", { name: "일시정지" })).toBeInTheDocument();
  });

  it("카메라 전환 성공 시 확정 토스트 문구를 띄운다", async () => {
    stubWorkingCamera();
    renderRoom("/room/7?userId=1");
    // 카메라가 실제로 열릴 때까지 기다린다 — 목업 라벨이 사라지면 스트림이 붙은 것이다.
    await waitFor(() => {
      expect(screen.queryByText("[ 전 면 카 메 라 프 리 뷰 ]")).toBeNull();
    });

    await userEvent.click(screen.getByRole("button", { name: "카메라 전환" }));

    expect(await screen.findByText("카메라를 전환했어요")).toBeInTheDocument();
  });

  it("종료 클릭 시 제출하고 S4(공부 결과)로 결과를 들고 넘어간다", async () => {
    // 세션 단건 조회 API가 없으므로 제출 응답을 **라우터 state로 넘기는 것이 유일한 전달 수단**이다.
    vi.mocked(submitStudySession).mockResolvedValue([
      {
        id: 10,
        userId: 1,
        statDate: "2026-07-25",
        startedAt: "2026-07-25T01:00:00Z",
        endedAt: "2026-07-25T02:00:00Z",
        studySec: 3600,
        focusSec: 3600,
        focusRate: 100,
        events: [],
      },
    ]);
    renderRoom("/room/7?userId=1");

    await endSessionAfterMinute();

    expect(await screen.findByText("결과 라우트")).toBeInTheDocument();
    expect(screen.getByText("/room/7/result")).toBeInTheDocument();
    expect(screen.getByText("전달된 세션: 2026-07-25")).toBeInTheDocument();
    expect(vi.mocked(submitStudySession).mock.calls[0]![0]).toMatchObject({
      userId: 1,
      events: [],
    });
  });

  it("제출 실패 시 메시지와 재시도 버튼을 보여준다 — S4로 넘기지 않는다", async () => {
    // S4는 저장 실패 배너를 만들지 않기로 스펙됐다(SCR-S4) — 여기서 넘겨 버리면 실패가
    // 조용히 삼켜져 사용자에게 아무 안내도 남지 않는다.
    vi.mocked(submitStudySession).mockRejectedValueOnce(
      new Error("존재하지 않는 사용자입니다: 999"),
    );
    renderRoom("/room/7?userId=999");

    await endSession();

    expect(await screen.findByText("존재하지 않는 사용자입니다: 999")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 제출" })).toBeInTheDocument();
    expect(screen.queryByText("결과 라우트")).not.toBeInTheDocument();
  });

  it("userId가 없으면 제출 없이 저장 안 됨 안내를 보여준다 — S4로 넘기지 않는다", async () => {
    // 저장되지 않은 세션을 "공부 결과"로 보여주면 사실과 다르다(SCR-S4 Interaction Contract).
    renderRoom("/room/7");

    await endSession();

    expect(await screen.findByText(/서버에 저장되지 않았습니다/)).toBeInTheDocument();
    expect(vi.mocked(submitStudySession)).not.toHaveBeenCalled();
    expect(screen.queryByText("결과 라우트")).not.toBeInTheDocument();
  });

  it("userId가 숫자가 아니면 제출 없이 저장 안 됨 안내를 보여준다", async () => {
    renderRoom("/room/7?userId=abc");

    await endSession();

    expect(await screen.findByText(/서버에 저장되지 않았습니다/)).toBeInTheDocument();
    expect(vi.mocked(submitStudySession)).not.toHaveBeenCalled();
  });

  it("재시도해도 최초 종료 시점의 endedAt으로 멱등 제출한다", async () => {
    vi.mocked(submitStudySession).mockRejectedValueOnce(new Error("일시적 오류"));
    vi.mocked(submitStudySession).mockResolvedValueOnce([
      {
        id: 11,
        userId: 1,
        statDate: "2026-07-25",
        startedAt: "2026-07-25T01:00:00Z",
        endedAt: "2026-07-25T02:00:00Z",
        studySec: 3600,
        focusSec: 3600,
        focusRate: 100,
        events: [],
      },
    ]);
    renderRoom("/room/7?userId=1");

    await endSessionAfterMinute();
    expect(await screen.findByText("일시적 오류")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "다시 제출" }));
    expect(await screen.findByText("결과 라우트")).toBeInTheDocument();

    const calls = vi.mocked(submitStudySession).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]![0].endedAtMs).toBe(calls[0]![0].endedAtMs);
    expect(calls[1]![0].studySec).toBe(calls[0]![0].studySec);
    expect(calls[1]![0].focusSec).toBe(calls[0]![0].focusSec);
    expect(calls[1]![0].events).toEqual(calls[0]![0].events);
  });

  it("일시정지 구간이 1초를 넘기면 events에 PAUSE로 쌓인다", async () => {
    vi.useFakeTimers();
    try {
      // 가짜 타이머 구간에서는 userEvent(내부 지연 타이머)를 쓰지 않고 fireEvent로 직접 클릭한다.
      vi.mocked(submitStudySession).mockResolvedValue([]);
      renderRoom("/room/7?userId=1");

      fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      endSessionSync();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const request = vi.mocked(submitStudySession).mock.calls[0]![0];
      expect(request.events).toHaveLength(1);
      expect(request.events![0]).toMatchObject({ status: "PAUSE" });
      const event = request.events![0]!;
      expect(Date.parse(event.endedAt) - Date.parse(event.startedAt)).toBeGreaterThanOrEqual(1000);
      // 일시정지는 순공·총 공부를 모두 멈춘다 — 정지 구간이 studySec에 들어가면 안 된다.
      expect(request.studySec).toBeLessThan(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("감지 신호가 유지시간을 넘기면 자동으로 S3-2(비집중)로 바뀌고, 해제되면 문구 없이 복귀한다", async () => {
    vi.useFakeTimers();
    try {
      // `?detector=mock` — DEV에서만 통하는 override다. 이 쿼리가 없으면 실제 Vision 감지기가
      // 붙고, jsdom에는 카메라가 없어 어떤 신호도 나오지 않는다(=이 테스트가 검증할 대상이 없다).
      renderRoom("/room/7?userId=1&detector=mock");
      // 개발 빌드 전용 브리지 — 훅이 실제로 들고 있는 detector와 같은 인스턴스여야 한다.
      const detector = window.__focusonMockDetector;
      expect(detector).toBeDefined();

      await act(async () => {
        detector!.emit({ trigger: "PHONE", active: true });
        await vi.advanceTimersByTimeAsync(700);
      });

      expect(screen.getByRole("status")).toHaveTextContent("휴대폰을 사용 중인 것 같아요");
      expect(screen.getByText("내려놓으면 자동으로 다시 측정돼요")).toBeInTheDocument();

      await act(async () => {
        detector!.emit({ trigger: "PHONE", active: false });
        await vi.advanceTimersByTimeAsync(1700);
      });

      // 해제는 색만 복귀 — 별도 안내 문구를 띄우지 않는다.
      expect(screen.getByRole("status")).toHaveTextContent("집중 측정 중");
      expect(screen.queryByText("내려놓으면 자동으로 다시 측정돼요")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("StrictMode 이중 초기화에도 dev 브리지가 훅이 쓰는 detector와 같은 인스턴스다", async () => {
    // React 19 StrictMode는 dev에서 useState lazy initializer를 두 번 호출한다.
    // 싱글턴이 아니면 window 브리지와 훅이 서로 다른 detector를 잡아 emit이 화면에 닿지 않는다.
    vi.useFakeTimers();
    try {
      render(
        <StrictMode>
          <MemoryRouter initialEntries={["/room/7?userId=1&detector=mock"]}>
            <Routes>
              <Route path="/room/:id" element={<RoomPage />} />
            </Routes>
          </MemoryRouter>
        </StrictMode>,
      );

      await act(async () => {
        window.__focusonMockDetector!.emit({ trigger: "AWAY", active: true });
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(screen.getByRole("status")).toHaveTextContent("자리를 비운 것 같아요");
    } finally {
      vi.useRealTimers();
    }
  });

  it("StrictMode 이중 마운트에도 카메라를 한 번만 열고 스트림을 흘리지 않는다", async () => {
    // effect → cleanup(stop) → effect가 연달아 도는데, 그 사이 getUserMedia는 아직
    // 해결되지 않았다. 진행 중 가드가 없으면 카메라가 두 번 열리고 한쪽이 고아가 된다.
    const camera = stubWorkingCamera();

    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/room/7?userId=1"]}>
          <Routes>
            <Route path="/room/:id" element={<RoomPage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    );

    // 목업 라벨이 사라지면 스트림이 붙은 것이다.
    await waitFor(() => {
      expect(screen.queryByText("[ 전 면 카 메 라 프 리 뷰 ]")).toBeNull();
    });

    expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
    expect(camera.opened.filter((track) => track.stop.mock.calls.length === 0)).toHaveLength(1);
  });

  it("언마운트가 카메라 트랙을 실제로 멈춘다", async () => {
    const camera = stubWorkingCamera();
    const { unmount } = renderRoom("/room/7?userId=1");
    await waitFor(() => {
      expect(screen.queryByText("[ 전 면 카 메 라 프 리 뷰 ]")).toBeNull();
    });

    unmount();

    expect(camera.opened).toHaveLength(1);
    expect(camera.opened[0]?.stop).toHaveBeenCalled();
  });

  it("비집중은 순공만 멈추고 총 공부는 계속 흐른다", async () => {
    vi.useFakeTimers();
    try {
      renderRoom("/room/7?userId=1&detector=mock");
      const detector = window.__focusonMockDetector;

      await act(async () => {
        detector!.emit({ trigger: "AWAY", active: true });
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(screen.getByRole("status")).toHaveTextContent("자리를 비운 것 같아요");

      const focusAfterDetect = screen.getByText(/^\d{2}:\d{2}:\d{2}$/).textContent;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      // 순공은 감지 시점에서 멈춰 있고, 총 공부는 계속 올라간다.
      expect(screen.getByText(/^\d{2}:\d{2}:\d{2}$/).textContent).toBe(focusAfterDetect);
      expect(screen.getByText("총 00:00:05")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("RoomPage — S3-3 일시정지", () => {
  afterEach(() => {
    vi.clearAllMocks();
    setVisibility("visible");
  });

  it("상태 필·서브 문구를 일시정지 문구로 바꾼다", async () => {
    renderRoom("/room/7?userId=1");

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));

    expect(screen.getByRole("status")).toHaveTextContent("측정을 일시정지했어요");
    expect(screen.getByText("다시 시작하면 이어서 측정돼요")).toBeInTheDocument();
  });

  it("하단 캡션이 프라이버시 캡션을 대체한다 — 두 줄을 동시에 띄우지 않는다", async () => {
    renderRoom("/room/7?userId=1");
    expect(screen.getByText("영상은 기기 안에서만 처리돼요")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));

    expect(screen.getByText("일시정지 중에는 시간이 흐르지 않아요")).toBeInTheDocument();
    expect(screen.queryByText("영상은 기기 안에서만 처리돼요")).not.toBeInTheDocument();
  });

  it("컨트롤 바 첫 버튼이 파란 재개 버튼으로 교체된다", async () => {
    renderRoom("/room/7?userId=1");

    const pauseButton = screen.getByRole("button", { name: "일시정지" });
    expect(pauseButton.className).toContain("bg-white/12");
    const pauseIconSrc = pauseButton.querySelector("img")?.getAttribute("src");

    await userEvent.click(pauseButton);

    const resumeButton = screen.getByRole("button", { name: "다시 시작" });
    expect(resumeButton.className).toContain("bg-[var(--session-resume-bg)]");
    // 아이콘도 play로 교체된다(Figma 인스턴스 오버라이드). Vite가 작은 SVG를 data URI로
    // 인라인해서 파일명이 남지 않으므로 "pause와 다른 자산"인지로 검증한다.
    const resumeIconSrc = resumeButton.querySelector("img")?.getAttribute("src");
    expect(resumeIconSrc).toBeDefined();
    expect(resumeIconSrc).not.toBe(pauseIconSrc);
  });

  it("카메라 전환·종료 버튼은 일시정지 중에도 활성 상태를 유지한다", async () => {
    renderRoom("/room/7?userId=1");

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));

    expect(screen.getByRole("button", { name: "카메라 전환" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "공부 종료" })).toBeEnabled();
  });

  it("화면 꺼짐·백그라운드도 같은 일시정지 화면으로 들어간다 — 별도 화면·라벨이 없다", () => {
    renderRoom("/room/7?userId=1");

    act(() => {
      setVisibility("hidden");
    });

    expect(screen.getByRole("status")).toHaveTextContent("측정을 일시정지했어요");
    expect(screen.getByText("일시정지 중에는 시간이 흐르지 않아요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시작" })).toBeInTheDocument();
    expect(screen.queryByText(/화면 꺼짐/)).not.toBeInTheDocument();
  });

  it("복귀해도 일시정지에 머문다 — 수동 재개 확정(2026-07-26)", () => {
    renderRoom("/room/7?userId=1");

    act(() => {
      setVisibility("hidden");
    });
    act(() => {
      setVisibility("visible");
    });

    expect(screen.getByRole("status")).toHaveTextContent("측정을 일시정지했어요");
  });

  it("화면 꺼짐으로 들어간 일시정지도 서버에는 PAUSE 하나로 나간다", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(submitStudySession).mockResolvedValue([]);
      renderRoom("/room/7?userId=1");

      act(() => {
        setVisibility("hidden");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      endSessionSync();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const request = vi.mocked(submitStudySession).mock.calls[0]![0];
      expect(request.events).toHaveLength(1);
      expect(request.events![0]).toMatchObject({ status: "PAUSE" });
      // 일시정지는 총 공부 시간까지 멈춘다.
      expect(request.studySec).toBeLessThan(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("수동 일시정지 중 화면이 꺼져도 PAUSE 이벤트는 1건이다", async () => {
    // 회귀(qa-WG2 F1): 트리거가 MANUAL → BACKGROUND로 바뀌면 구간이 쪼개져
    // eventCounts.PAUSE가 2가 되고 S4·S5에 "일시정지 2회"로 표시된다.
    // 두 트리거가 **겹치는** 조합이라 단독 트리거만 보는 위 두 테스트로는 잡히지 않는다.
    vi.useFakeTimers();
    try {
      vi.mocked(submitStudySession).mockResolvedValue([]);
      renderRoom("/room/7?userId=1");

      fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      act(() => {
        setVisibility("hidden");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      act(() => {
        setVisibility("visible");
      });
      endSessionSync();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const request = vi.mocked(submitStudySession).mock.calls[0]![0];
      expect(request.events).toHaveLength(1);
      expect(request.events![0]).toMatchObject({ status: "PAUSE" });
      // 끊기지 않고 한 구간으로 이어져야 한다(4초 전체).
      const event = request.events![0]!;
      expect(Date.parse(event.endedAt) - Date.parse(event.startedAt)).toBeGreaterThanOrEqual(4000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("화면 꺼짐이 반복돼도 구간이 쪼개지지 않는다", async () => {
    // pagehide와 visibilitychange가 둘 다 발화하는 WKWebView 경로 — 중복 신호가 들어와도
    // 이미 PAUSE면 무시된다(어댑터 주석의 "중복 호출은 안전하다"를 실제로 고정).
    vi.useFakeTimers();
    try {
      vi.mocked(submitStudySession).mockResolvedValue([]);
      renderRoom("/room/7?userId=1");

      act(() => {
        setVisibility("hidden");
        window.dispatchEvent(new Event("pagehide"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      endSessionSync();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(vi.mocked(submitStudySession).mock.calls[0]![0].events).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("RoomPage — S3-4 심플 모드", () => {
  afterEach(() => {
    vi.clearAllMocks();
    // 아래 `<video>` 유지 테스트가 stubGlobal("navigator", ...)을 건다 — 다른 테스트로 새지
    // 않게 원복한다(스텁한 적 없으면 no-op).
    vi.unstubAllGlobals();
  });

  async function enterSimpleMode() {
    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
  }

  it("카메라 프리뷰를 걷어내고 심플 서피스로 교체한다", async () => {
    const { container } = renderRoom("/room/7?userId=1");
    expect(container.querySelector('[data-session-surface="camera"]')).not.toBeNull();

    await enterSimpleMode();

    expect(container.querySelector('[data-session-surface="camera"]')).toBeNull();
    expect(container.querySelector('[data-session-surface="simple"]')).not.toBeNull();
  });

  it("보이는 프리뷰만 걷어내고 <video>는 살려둔다 — 심플 모드에서도 감지가 돈다", async () => {
    // `<video>`는 카메라가 실제로 도는 동안에만 렌더된다 — 스트림을 붙여야 이 경로에 닿는다.
    stubWorkingCamera();
    const { container } = renderRoom("/room/7?userId=1");
    await waitFor(() => {
      expect(container.querySelector("video")).not.toBeNull();
    });
    const before = container.querySelector("video");

    await enterSimpleMode();

    // 언마운트하면 videoRef.current가 null이 되어 추론이 프레임을 못 받고, 신호가 직전 값에
    // 굳은 채 심플 모드 내내 유지된다 — 들어간 순간의 상태가 세션 끝까지 기록되는 조용한 오류다.
    // 측정은 화면 표시 방식에 좌우되면 안 된다(2026-07-29 리더 결정).
    expect(container.querySelector("video")).toBe(before);
  });

  it("하단 캡션 행이 사라진다 — S3-4에는 캡션 자리가 없다", async () => {
    renderRoom("/room/7?userId=1");

    await enterSimpleMode();

    expect(screen.queryByText("영상은 기기 안에서만 처리돼요")).not.toBeInTheDocument();
  });

  it("상태 필과 컨트롤 바는 유지된다 — 색 단독으로 상태를 전달하지 않기 위함", async () => {
    renderRoom("/room/7?userId=1");

    await enterSimpleMode();

    expect(screen.getByRole("status")).toHaveTextContent("집중 측정 중");
    expect(screen.getByRole("button", { name: "일시정지" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "카메라 전환" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "공부 종료" })).toBeInTheDocument();
  });

  /**
   * 프리뷰가 없는 화면에서 전환을 누르면 보이는 변화 없이 추론만 1~2초 끊긴다(BY-336).
   * 버튼을 **없애지 않고 잠그는** 이유는 세 버튼 배치가 고정이라 하나가 빠지면 심플 모드
   * 진입 자체가 레이아웃 점프가 되기 때문이다.
   */
  it("카메라 전환은 잠긴다 — 프리뷰가 없어 결과를 볼 수 없다", async () => {
    renderRoom("/room/7?userId=1");
    const flip = () => screen.getByRole("button", { name: "카메라 전환" });

    expect(flip()).toBeEnabled();

    await enterSimpleMode();
    expect(flip()).toBeDisabled();

    // 프리뷰로 돌아오면 다시 풀린다 — 표시 모드에만 걸리는 조건이다.
    await enterSimpleMode();
    expect(flip()).toBeEnabled();
  });

  /**
   * 상태 필의 서브 문구가 생기고 사라지면 필 블록 높이가 22px 변하는데, 그 델타를 위아래
   * 스페이서가 나눠 흡수하면서 심플 모드의 큰 타이머가 위아래로 흔들렸다(BY-336 실기기 관측).
   * 서브 문구 줄을 상주시켜 막는다 — 이 테스트는 그 상주를 고정한다.
   */
  it("상태가 바뀌어도 상태 필 블록 높이가 변하지 않는다 — 타이머가 흔들리지 않기 위함", async () => {
    renderRoom("/room/7?userId=1&detector=mock");
    const subLabelRow = () => screen.getByRole("status").lastElementChild!;

    // 집중에는 서브 문구가 없지만 줄 자체는 자리를 지킨다.
    expect(subLabelRow().textContent).toBe("");
    expect(subLabelRow().className).toContain("h-[14px]");

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));

    // 문구가 채워져도 같은 줄이다 — 새 행이 끼어들지 않는다.
    expect(subLabelRow().textContent).not.toBe("");
    expect(subLabelRow().className).toContain("h-[14px]");
  });

  it("타이머가 상태 컬러 + 발광으로 바뀐다", async () => {
    renderRoom("/room/7?userId=1");
    const timerOf = () => screen.getByText("00:00:00").parentElement!;

    expect(timerOf().className).toContain("text-white");
    // 프리뷰의 발광 꺼짐은 빈 값이 아니라 **같은 구조의 투명 그림자**다 — 목록 길이·단위가
    // 같아야 브라우저가 보간해서 발광이 300ms로 페이드된다(BY-336, `NO_GLOW_TEXT_SHADOW`).
    expect(timerOf().style.textShadow).toContain("transparent");
    expect(timerOf().style.textShadow).not.toContain("var(--session-glow-near)");

    await enterSimpleMode();

    expect(timerOf().className).toContain("text-[var(--session-state-color)]");
    expect(timerOf().style.textShadow).toContain("var(--session-glow-near)");
  });

  /**
   * 회전 중에는 카메라 서피스가 잠깐 뷰포트보다 작게 잡혀 가장자리에 빈 공간이 보인다(BY-336).
   * 가리지 않고 **메우는** 방식이라 "언제 확대하고 언제 되돌리는지"를 고정한다.
   */
  it("회전 중에는 프리뷰를 살짝 확대해 빈 자리를 메우고, 뷰포트가 확정되면 되돌린다", () => {
    const { container } = renderRoom("/room/7?userId=1");
    const surfaceOf = () => container.querySelector('[data-session-surface="camera"]');

    expect(surfaceOf()?.className).not.toContain("scale-");

    vi.useFakeTimers();
    try {
      // 세로 → 가로. jsdom 기본값이 1024×768(가로)이라 세로로 만들어 두고 뒤집는다.
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

      expect(surfaceOf()?.className).toContain("scale-[1.08]");

      act(() => {
        vi.advanceTimersByTime(450);
      });

      // 뷰포트가 확정되면 원래 배율로 — 정지 상태의 화각은 그대로여야 한다.
      expect(surfaceOf()?.className).not.toContain("scale-");
    } finally {
      vi.useRealTimers();
    }
  });

  it("심플 모드에서는 회전 오버스캔을 걸지 않는다 — 메울 빈 자리가 없다", async () => {
    const { container } = renderRoom("/room/7?userId=1");
    await enterSimpleMode();

    vi.useFakeTimers();
    try {
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

      // 카메라를 걷어낸 화면이라 단색 배경을 확대해 봐야 보이는 변화가 없다.
      expect(container.innerHTML).not.toContain("scale-[1.08]");
    } finally {
      vi.useRealTimers();
    }
  });

  it("방향이 그대로인 리사이즈에는 확대하지 않는다 — 키보드·주소창 변화까지 건드리지 않는다", () => {
    const { container } = renderRoom("/room/7?userId=1");

    act(() => {
      // 가로를 유지한 채 폭만 줄인다(jsdom 기본 1024×768도 가로다).
      window.innerWidth = 900;
      window.innerHeight = 768;
      window.dispatchEvent(new Event("resize"));
    });

    expect(container.querySelector('[data-session-surface="camera"]')?.className).not.toContain(
      "scale-",
    );
  });

  it("엣지 글로우는 잔향이다 — 페이드아웃 애니메이션 레이어로 그린다", async () => {
    // design.md "전환 시 글로우 1~2초 잔향" 확정(BY-336) — 정적 점등이 아니라
    // 상태 전환마다 리마운트되어 점등→페이드아웃하는 레이어다(SimpleModeSurface 주석).
    const { container } = renderRoom("/room/7?userId=1");
    await enterSimpleMode();

    const surface = container.querySelector('[data-session-surface="simple"]')!;
    expect(surface.querySelector(".session-edge-glow-fade")).not.toBeNull();
  });

  it("대칭 복귀 — 한 번 더 탭하면 프리뷰로 돌아온다", async () => {
    const { container } = renderRoom("/room/7?userId=1");

    await enterSimpleMode();
    await enterSimpleMode();

    expect(container.querySelector('[data-session-surface="camera"]')).not.toBeNull();
    expect(screen.getByText("영상은 기기 안에서만 처리돼요")).toBeInTheDocument();
  });

  it("표시 모드와 세션 상태는 직교한다 — 심플 모드에서 일시정지·재개해도 심플 모드가 유지된다", async () => {
    const { container } = renderRoom("/room/7?userId=1");
    await enterSimpleMode();

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));
    expect(screen.getByRole("status")).toHaveTextContent("측정을 일시정지했어요");
    expect(container.querySelector('[data-session-surface="simple"]')).not.toBeNull();
    // 심플 모드에는 캡션 행이 없으므로 일시정지 캡션도 놓일 자리가 없다(Figma 미설계 — 스펙 기록).
    expect(screen.queryByText("일시정지 중에는 시간이 흐르지 않아요")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "다시 시작" }));

    expect(container.querySelector('[data-session-surface="simple"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "심플 모드 전환" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("RoomPage — S3-7 종료 확인", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  async function openExitDialog() {
    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));
    return screen.getByRole("alertdialog");
  }

  it("종료 버튼은 세션을 끝내지 않고 확인 다이얼로그를 띄운다", async () => {
    renderRoom("/room/7?userId=1");

    const dialog = await openExitDialog();

    expect(within(dialog).getByText("공부를 종료할까요?")).toBeInTheDocument();
    expect(vi.mocked(submitStudySession)).not.toHaveBeenCalled();
    // 세션 화면은 그대로 살아 있다 — 딤 뒤에서 계속 측정된다.
    expect(screen.getByRole("status")).toHaveTextContent("집중 측정 중");
  });

  /**
   * 갓 입장한 세션은 순공 0초라 **미달 분기**로 들어간다(2026-07-27 확정: 순공 1분 미만은
   * 기록에 표시되지 않는다). 예전에는 `지금까지 집중한 0초는 저장돼요`였는데, 그 문구는
   * 기록에 남지 않는 세션을 두고 저장을 약속하는 거짓이었다.
   *
   * 1분 이상일 때의 문구(`지금까지 집중한 N은 저장돼요`)는 `sessionCopy.test.ts`가 값별로
   * 검증한다 — 여기서 타이머를 1분 넘게 돌리는 것보다 그쪽이 정확하다.
   */
  it("순공 1분 미만이면 저장을 약속하지 않고 미달을 알린다", async () => {
    renderRoom("/room/7?userId=1");

    const dialog = await openExitDialog();

    expect(within(dialog).getByText(SUB_MINUTE_EXIT_DESCRIPTION)).toBeInTheDocument();
    expect(within(dialog).queryByText(/저장돼요/)).not.toBeInTheDocument();
    // 다이얼로그에는 HH:MM:SS도, 초 숫자도 쓰지 않는다.
    expect(within(dialog).queryByText(/00:00:00/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/\d+초/)).not.toBeInTheDocument();
  });

  it("확정 문구를 그대로 쓴다 — 버튼은 '계속하기' / '공부 종료'", async () => {
    renderRoom("/room/7?userId=1");

    const dialog = await openExitDialog();

    expect(within(dialog).getByRole("button", { name: "계속하기" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "공부 종료" })).toBeInTheDocument();
  });

  it("'계속하기'는 세션을 유지한 채 다이얼로그만 닫는다", async () => {
    renderRoom("/room/7?userId=1");
    const dialog = await openExitDialog();

    await userEvent.click(within(dialog).getByRole("button", { name: "계속하기" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(vi.mocked(submitStudySession)).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "공부 종료" })).toBeInTheDocument();
  });

  it("일시정지 중에 열었다 닫으면 일시정지 상태 그대로 복귀한다", async () => {
    renderRoom("/room/7?userId=1");
    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));

    const dialog = await openExitDialog();
    await userEvent.click(within(dialog).getByRole("button", { name: "계속하기" }));

    expect(screen.getByRole("status")).toHaveTextContent("측정을 일시정지했어요");
    expect(screen.getByRole("button", { name: "다시 시작" })).toBeInTheDocument();
  });

  it("Esc는 비파괴 기본값 — 닫기만 하고 세션을 끝내지 않는다", async () => {
    // ⚠️ 디자인 미정 항목(SCR-S3-7·S3-8). 종료는 되돌릴 수 없으므로 이 경로로 확정시키지 않는다.
    renderRoom("/room/7?userId=1");
    await openExitDialog();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(vi.mocked(submitStudySession)).not.toHaveBeenCalled();
  });

  it("'공부 종료'에서만 실제로 제출한다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    renderRoom("/room/7?userId=1");
    const dialog = await openExitDialog();

    await userEvent.click(within(dialog).getByRole("button", { name: "공부 종료" }));

    expect(vi.mocked(submitStudySession)).toHaveBeenCalledTimes(1);
  });

  it("alertdialog 시맨틱과 타이틀·본문 연결을 갖는다", async () => {
    renderRoom("/room/7?userId=1");

    const dialog = await openExitDialog();

    expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(document.getElementById(labelledBy!)).toHaveTextContent("공부를 종료할까요?");
    // 갓 입장한 세션이라 본문은 미달 문구다(위 테스트 주석 참고).
    expect(document.getElementById(describedBy!)).toHaveTextContent(SUB_MINUTE_EXIT_DESCRIPTION);
  });

  it("초기 포커스는 비파괴 버튼('계속하기')에 놓인다", async () => {
    renderRoom("/room/7?userId=1");

    const dialog = await openExitDialog();

    expect(within(dialog).getByRole("button", { name: "계속하기" })).toHaveFocus();
  });

  it("닫히면 포커스가 컨트롤 바 종료 버튼으로 돌아온다", async () => {
    renderRoom("/room/7?userId=1");
    const exitButton = screen.getByRole("button", { name: "공부 종료" });

    await userEvent.click(exitButton);
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "계속하기" }),
    );

    expect(exitButton).toHaveFocus();
  });

  it("열려 있는 동안 배경 세션 레이어를 inert로 만든다", async () => {
    const { container } = renderRoom("/room/7?userId=1");
    const tapLayer = screen.getByRole("button", { name: "심플 모드 전환" });
    expect(tapLayer).not.toHaveAttribute("inert");

    await openExitDialog();

    expect(screen.getByRole("button", { name: "심플 모드 전환" })).toHaveAttribute("inert");
    // 세션 레이아웃 레이어(상태 필·타이머·컨트롤 바를 담은 컨테이너)도 함께 꺼진다.
    expect(container.querySelectorAll("[inert]")).toHaveLength(2);
  });

  it("다이얼로그는 세션 레이아웃 레이어의 **형제**다 — 자식이면 가로 그리드가 깨진다", () => {
    // qa-WG3 실측: `SESSION_LAYER_LAYOUT` div의 자식으로 넣으면 (1) 가로에서 좌상단에 배치되고
    // (2) 심플 타이머가 밀리고 (3) pointer-events-none을 상속해 버튼이 클릭을 못 받는다.
    // 구조 자체를 고정해 회귀를 막는다.
    const { container } = renderRoom("/room/7?userId=1");
    fireEvent.click(screen.getByRole("button", { name: "공부 종료" }));

    const dialogOverlay = screen.getByRole("alertdialog").parentElement!;
    const layoutLayer = container.querySelector(".pointer-events-none")!;

    expect(layoutLayer.contains(dialogOverlay)).toBe(false);
    expect(dialogOverlay.parentElement).toBe(layoutLayer.parentElement);
    // 오버레이는 pointer-events를 직접 켠다(레이어의 none을 상속하지 않는다).
    expect(dialogOverlay.className).toContain("pointer-events-auto");
    expect(dialogOverlay.className).toContain("absolute inset-0");
  });
});

/**
 * 순공 1분 미만 종료 — **S4로 보내지 않는다**(2026-07-27 확정, ai-wiki `mvp-scope.md`
 * "기록 저장·표시 기준": "결과 화면(S4) 대신 간단 안내 후 홈으로 이동한다").
 */
describe("RoomPage — 미달 종료(순공 1분 미만)", () => {
  // 모듈 스코프 mock이라 정리하지 않으면 호출 기록이 테스트 간 누적된다(다른 describe와 동일).
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("결과 화면 대신 미달 안내를 보여준다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    const { container } = renderRoom("/room/7?userId=1");

    // 갓 입장해서 바로 종료 — 순공 0초다.
    await endSession();

    expect(await screen.findByText("1분 미만 공부는 기록에 표시되지 않아요")).toBeInTheDocument();
    expect(screen.queryByText("결과 라우트")).not.toBeInTheDocument();
    // 체크 서클(2026-08-01 사용자 확인, BY-336) — S3-8과 같은 완료 신호를 공유한다.
    expect(
      container.querySelector('[data-session-surface="sub-minute-end"] .bg-brand-subtle'),
    ).not.toBeNull();
  });

  /**
   * 걸러내는 것은 표시·합산 단계이고 **저장은 정상적으로 한다** — 백엔드는 순공시간과 무관하게
   * 모든 세션을 저장하는 것이 계약이다(mvp-scope). 이 검증이 깨지면 제출을 건너뛰는 회귀다.
   */
  it("그래도 서버에는 제출한다 — 저장을 건너뛰지 않는다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    renderRoom("/room/7?userId=1");

    await endSession();
    await screen.findByText("1분 미만 공부는 기록에 표시되지 않아요");

    expect(vi.mocked(submitStudySession)).toHaveBeenCalledTimes(1);
  });

  it("CTA는 홈으로 보낸다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    renderRoom("/room/7?userId=1");

    await endSession();
    await screen.findByText("1분 미만 공부는 기록에 표시되지 않아요");
    await userEvent.click(screen.getByRole("button", { name: "홈으로" }));

    expect(await screen.findByText("홈 라우트")).toBeInTheDocument();
  });

  /**
   * 2026-07-30 실기기 확인: 이 배선이 없으면 웹 라우터 이동만 실행되어 WebView 안에
   * `apps/web`의 웹 홈이 열리고, 네이티브 탭 홈으로는 돌아가지 않는다. `postToNative`가 실제로
   * 불렸는지까지 확인해야 이 회귀를 잡는다 — 웹 라우터가 정상 이동했다고 해서 네이티브 쪽
   * 신호가 나갔다는 보장은 없다.
   */
  it("네이티브 브리지가 있으면 홈 복귀 신호도 함께 보낸다", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    vi.mocked(submitStudySession).mockResolvedValue([]);
    renderRoom("/room/7?userId=1");

    await endSession();
    await screen.findByText("1분 미만 공부는 기록에 표시되지 않아요");
    await userEvent.click(screen.getByRole("button", { name: "홈으로" }));

    expect(postMessage).toHaveBeenCalledWith(expect.stringContaining('"type":"navigate-home"'));
    vi.unstubAllGlobals();
  });

  /** S3-8의 타이틀은 `여기까지 기록을 저장했어요`로 단언하므로 미달 세션에 쓰면 거짓이 된다. */
  it("기록에 남았다고 단언하는 S3-8 문구를 쓰지 않는다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    renderRoom("/room/7?userId=1");

    await endSession();
    await screen.findByText("1분 미만 공부는 기록에 표시되지 않아요");

    expect(screen.queryByText("여기까지 기록을 저장했어요")).not.toBeInTheDocument();
  });

  /**
   * 제출이 아직 끝나지 않았거나 실패한 상태에서 이 안내를 띄우면 재시도 경로가 사라진다 —
   * `phase === "done"`을 요구하는 이유다.
   */
  it("제출이 실패하면 미달 안내 대신 재시도 경로로 보낸다", async () => {
    vi.mocked(submitStudySession).mockRejectedValueOnce(new Error("일시적 오류"));
    renderRoom("/room/7?userId=1");

    await endSession();

    expect(await screen.findByText("일시적 오류")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 제출" })).toBeInTheDocument();
    expect(screen.queryByText("1분 미만 공부는 기록에 표시되지 않아요")).not.toBeInTheDocument();
  });

  it("userId가 없어 저장되지 않은 세션도 미달 안내로 가지 않는다", async () => {
    renderRoom("/room/7");

    await endSession();

    expect(await screen.findByText(/서버에 저장되지 않았습니다/)).toBeInTheDocument();
    expect(screen.queryByText("1분 미만 공부는 기록에 표시되지 않아요")).not.toBeInTheDocument();
  });
});
