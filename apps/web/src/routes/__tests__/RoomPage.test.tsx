import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("RoomPage", () => {
  // 브리프 원문에는 없던 추가: 모듈 스코프 mock이라 clearAllMocks 없이는 호출 기록이
  // 테스트 간 누적돼 "userId 없으면 호출 안 됨" 검증이 이전 테스트의 호출과 섞인다.
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("타이머와 종료 버튼을 렌더링한다", () => {
    renderRoom("/room/7?userId=1");

    expect(screen.getByText("스터디룸 #7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "공부 종료" })).toBeInTheDocument();
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
});
