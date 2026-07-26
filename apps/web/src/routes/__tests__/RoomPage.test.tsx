import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { submitStudySession } from "@/features/study-session/submitStudySession";
import { RoomPage } from "../RoomPage";

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

function renderRoom(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RoomPage — S3-1 프리뷰 / S3-2 비집중", () => {
  // 모듈 스코프 mock이라 clearAllMocks 없이는 호출 기록이 테스트 간 누적된다.
  afterEach(() => {
    vi.clearAllMocks();
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

  it("컨트롤 바 밖 탭으로 심플 모드를 토글한다 (프레젠테이션은 WG2)", async () => {
    renderRoom("/room/7?userId=1");

    const tapLayer = screen.getByRole("button", { name: "심플 모드 전환" });
    expect(tapLayer).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(tapLayer);
    expect(screen.getByRole("button", { name: "심플 모드 전환" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("일시정지 버튼이 재개로 토글된다", async () => {
    renderRoom("/room/7?userId=1");

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));
    expect(screen.getByRole("button", { name: "재개" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "재개" }));
    expect(screen.getByRole("button", { name: "일시정지" })).toBeInTheDocument();
  });

  it("카메라 전환 성공 시 확정 토스트 문구를 띄운다", async () => {
    renderRoom("/room/7?userId=1");

    await userEvent.click(screen.getByRole("button", { name: "카메라 전환" }));

    expect(await screen.findByText("카메라를 전환했어요")).toBeInTheDocument();
  });

  it("종료 클릭 시 제출하고 서버 결과를 표시한다", async () => {
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

    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));

    expect(await screen.findByText("2026-07-25")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(vi.mocked(submitStudySession).mock.calls[0]![0]).toMatchObject({
      userId: 1,
      events: [],
    });
  });

  it("제출 실패 시 메시지와 재시도 버튼을 보여준다", async () => {
    vi.mocked(submitStudySession).mockRejectedValueOnce(
      new Error("존재하지 않는 사용자입니다: 999"),
    );
    renderRoom("/room/7?userId=999");

    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));

    expect(await screen.findByText("존재하지 않는 사용자입니다: 999")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 제출" })).toBeInTheDocument();
  });

  it("userId가 없으면 제출 없이 저장 안 됨 안내를 보여준다", async () => {
    renderRoom("/room/7");

    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));

    expect(await screen.findByText(/서버에 저장되지 않았습니다/)).toBeInTheDocument();
    expect(vi.mocked(submitStudySession)).not.toHaveBeenCalled();
  });

  it("userId가 숫자가 아니면 제출 없이 저장 안 됨 안내를 보여준다", async () => {
    renderRoom("/room/7?userId=abc");

    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));

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

    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));
    expect(await screen.findByText("일시적 오류")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "다시 제출" }));
    expect(await screen.findByText("2026-07-25")).toBeInTheDocument();

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
      fireEvent.click(screen.getByRole("button", { name: "공부 종료" }));
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
      renderRoom("/room/7?userId=1");
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
          <MemoryRouter initialEntries={["/room/7?userId=1"]}>
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

  it("비집중은 순공만 멈추고 총 공부는 계속 흐른다", async () => {
    vi.useFakeTimers();
    try {
      renderRoom("/room/7?userId=1");
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
