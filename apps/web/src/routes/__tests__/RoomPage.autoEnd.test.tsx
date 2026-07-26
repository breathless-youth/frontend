import type { StudySessionResponse } from "@focuson/types";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as SessionTuningModule from "@/features/study-session/sessionTuning";
import { submitStudySession } from "@/features/study-session/submitStudySession";
import { RoomPage } from "../RoomPage";

/**
 * S3-8 자동 종료 안내 — **라우트까지 통과하는** 통합 테스트.
 *
 * 프로덕션 기본 임계값은 미정(`autoEndPauseMinutes: null` = 감시 비활성)이라 그대로는 이 화면에
 * 도달할 수 없다. `RoomPage`는 라우트 요소라 튜닝 값을 주입할 prop이 없고, 테스트를 위해
 * 프로덕션 코드에 주입 구멍을 뚫지 않는다 — 대신 **설정 모듈만 모킹**해서 짧은 값을 넣는다.
 * 그래서 이 파일은 `RoomPage.test.tsx`와 분리돼 있다(모킹이 파일 전체에 걸리기 때문).
 */
vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

/** 0.05분 = 3초. 테스트 전용 값이며 확정된 정책 값이 아니다. */
vi.mock("@/features/study-session/sessionTuning", async (importOriginal) => {
  const actual = await importOriginal<typeof SessionTuningModule>();
  return { ...actual, DEFAULT_SESSION_TUNING: { autoEndPauseMinutes: 0.05 } };
});

const THRESHOLD_MS = 3_000;

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** S4 라우트 자리의 프로브 — 결과 화면이 아니라 **배선**만 관측한다. */
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

function renderRoom(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
        <Route path="/room/:id/result" element={<ResultRouteProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** 일시정지 임계값을 넘길 만큼 시간을 흘린다. */
async function waitPastThreshold() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(THRESHOLD_MS + 1_000);
  });
}

describe("RoomPage — S3-8 자동 종료 안내", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(submitStudySession).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    setVisibility("visible");
  });

  it("일시정지가 임계값을 넘기면 사용자 확인 없이 저장하고 안내 화면으로 넘어간다", async () => {
    renderRoom("/room/7?userId=1");

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    await waitPastThreshold();

    expect(vi.mocked(submitStudySession)).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "여기까지 기록을 저장했어요" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "결과 보기" })).toBeInTheDocument();
  });

  it("화면 꺼짐으로 종료되면 확정된 사유 문구를 보여준다", async () => {
    renderRoom("/room/7?userId=1");

    act(() => {
      setVisibility("hidden");
    });
    await waitPastThreshold();

    // Figma는 '측정이 어려워서' 뒤에서 줄바꿈한다 — 한 문단 안의 <br>라 텍스트가 이어져 있다.
    const body = screen.getByText(/화면이 꺼진 동안은 측정이 어려워서/);
    expect(body).toHaveTextContent("화면이 꺼진 동안은 측정이 어려워서");
    expect(body).toHaveTextContent("공부가 자동으로 종료됐어요");
  });

  it("수동 일시정지 방치로 종료되면 본문이 비어 있다 — 화면 꺼짐 문구를 재사용하지 않는다", async () => {
    // voice-tone.md §4의 ⚠️ 미정 항목. 화면을 끄지 않은 사용자에게 "화면이 꺼진 동안"이라고
    // 안내하면 사실과 다르다 — 문구가 확정될 때까지 본문을 비운다.
    renderRoom("/room/7?userId=1");

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    await waitPastThreshold();

    expect(screen.getByRole("heading", { name: "여기까지 기록을 저장했어요" })).toBeInTheDocument();
    expect(screen.queryByText(/화면이 꺼진 동안/)).not.toBeInTheDocument();
  });

  it("요약 카드는 순공·총 공부를 한글 시간 길이로 보여준다", async () => {
    renderRoom("/room/7?userId=1");

    // 60초 집중 후 일시정지 → 순공·총 공부 모두 1분에서 멈춘다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    await waitPastThreshold();

    const summary = screen.getByRole("heading").parentElement!;
    expect(within(summary).getByText("순공시간")).toBeInTheDocument();
    expect(within(summary).getByText("총 공부")).toBeInTheDocument();
    expect(within(summary).getAllByText("1분")).toHaveLength(2);
    // 이 화면에는 HH:MM:SS를 쓰지 않는다.
    expect(within(summary).queryByText(/\d{2}:\d{2}:\d{2}/)).not.toBeInTheDocument();
  });

  it("'화면 꺼짐'을 통계 라벨로 노출하지 않는다 — 2026-07-26에 일시정지로 통합됐다", async () => {
    renderRoom("/room/7?userId=1");

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    await waitPastThreshold();

    expect(screen.queryByText("화면 꺼짐")).not.toBeInTheDocument();
  });

  it("취소·재개 액션을 두지 않는다 — 이미 끝난 일에 대한 사후 안내다", async () => {
    renderRoom("/room/7?userId=1");

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    await waitPastThreshold();

    expect(screen.queryByRole("button", { name: "다시 시작" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "계속하기" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("자동 종료는 한 번만 제출한다 — 임계값을 계속 넘겨도 재제출하지 않는다", async () => {
    renderRoom("/room/7?userId=1");

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    await waitPastThreshold();
    await waitPastThreshold();

    expect(vi.mocked(submitStudySession)).toHaveBeenCalledTimes(1);
  });

  it("제출이 실패하면 안내 화면을 띄우지 않고 재시도 경로로 보낸다", async () => {
    // 타이틀이 `여기까지 기록을 저장했어요`로 단언하므로 저장 전에는 띄울 수 없다.
    vi.mocked(submitStudySession).mockRejectedValueOnce(new Error("일시적 오류"));
    renderRoom("/room/7?userId=1");

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    await waitPastThreshold();

    expect(screen.queryByText("여기까지 기록을 저장했어요")).not.toBeInTheDocument();
    expect(screen.getByText("일시적 오류")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 제출" })).toBeInTheDocument();
  });

  it("userId가 없어 저장되지 않은 세션은 안내 화면으로 가지 않는다", async () => {
    renderRoom("/room/7");

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    await waitPastThreshold();

    expect(vi.mocked(submitStudySession)).not.toHaveBeenCalled();
    expect(screen.queryByText("여기까지 기록을 저장했어요")).not.toBeInTheDocument();
    expect(screen.getByText(/서버에 저장되지 않았습니다/)).toBeInTheDocument();
  });

  it("일시정지 중 종료 다이얼로그를 열어 둔 채 임계값에 도달하면 다이얼로그가 사라지고 안내로 전환된다", async () => {
    // ⚠️ 확정 사항이 아니라 스펙이 적어 둔 **제안 기본값**이다(SCR-S3-7·S3-8 Interaction Contract).
    // 동작이 확정되면 이 테스트를 함께 고친다.
    renderRoom("/room/7?userId=1");

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    fireEvent.click(screen.getByRole("button", { name: "공부 종료" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await waitPastThreshold();

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "여기까지 기록을 저장했어요" })).toBeInTheDocument();
  });

  it("'결과 보기'는 이미 저장된 결과를 들고 S4로 이동한다 — 여기서 다시 제출하지 않는다", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    await waitPastThreshold();
    fireEvent.click(screen.getByRole("button", { name: "결과 보기" }));

    expect(screen.getByText("결과 라우트")).toBeInTheDocument();
    expect(screen.getByText("/room/7/result")).toBeInTheDocument();
    expect(screen.getByText("전달된 세션: 2026-07-25")).toBeInTheDocument();
    expect(screen.queryByText("여기까지 기록을 저장했어요")).not.toBeInTheDocument();
    // 이동은 재제출을 유발하지 않는다 — 자동 종료 시점의 1회가 전부다.
    expect(vi.mocked(submitStudySession)).toHaveBeenCalledTimes(1);
  });

  it("자동 종료는 안내 화면을 거친다 — 저장되자마자 S4로 튀지 않는다", async () => {
    // S3-8은 사용자가 유발하지 않은 종료라 "왜 끝났는지"를 먼저 알린다(user-flow `AE → F`).
    vi.mocked(submitStudySession).mockResolvedValue([]);
    renderRoom("/room/7?userId=1");

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    await waitPastThreshold();

    expect(screen.getByRole("heading", { name: "여기까지 기록을 저장했어요" })).toBeInTheDocument();
    expect(screen.queryByText("결과 라우트")).not.toBeInTheDocument();
  });
});
