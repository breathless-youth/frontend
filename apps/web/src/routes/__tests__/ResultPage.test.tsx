import type { StatusEventPayload, StudyEventStatus, StudySessionResponse } from "@focuson/types";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ResultPage } from "../ResultPage";

/** 로컬 시각으로 픽스처를 만들어 CI 타임존과 무관하게 같은 표기를 검증한다. */
const SESSION_START = new Date(2026, 6, 25, 21, 3, 0);
const SESSION_END = new Date(2026, 6, 25, 22, 48, 0);

function at(offsetSec: number): string {
  return new Date(SESSION_START.getTime() + offsetSec * 1000).toISOString();
}

function event(status: StudyEventStatus, fromSec: number, durationSec: number): StatusEventPayload {
  return { status, startedAt: at(fromSec), endedAt: at(fromSec + durationSec) };
}

/** SCR-S4 "구현용 예시 데이터(확정 모델)" — 총 공부 102분 / 벽시계 105분 / 비집중 18분. */
function exampleSession(overrides: Partial<StudySessionResponse> = {}): StudySessionResponse {
  return {
    id: 10,
    userId: 1,
    statDate: "2026-07-25",
    startedAt: SESSION_START.toISOString(),
    endedAt: SESSION_END.toISOString(),
    studySec: 6120,
    focusSec: 5040,
    focusRate: 82.35,
    events: [
      event("AWAY", 600, 300),
      event("PHONE", 1200, 200),
      event("DEVICE", 1800, 128),
      event("PAUSE", 2400, 180),
      event("AWAY", 3000, 280),
      event("PHONE", 3600, 172),
    ],
    ...overrides,
  };
}

/** 홈 리다이렉트를 관측하기 위한 프로브 — 실제 `HomePage`를 끌어오지 않는다. */
function HomeProbe() {
  return <p>홈 화면</p>;
}

function renderResult(state: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/room/7/result", state }]}>
      <Routes>
        <Route path="/" element={<HomeProbe />} />
        <Route path="/room/:id/result" element={<ResultPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function statsCard() {
  return screen.getByText(/^비집중 /).closest("section")!;
}

describe("ResultPage — S4 헤더", () => {
  it("타이틀·순공시간 대형값·집중률 필·메타 라인을 확정 형식으로 그린다", () => {
    renderResult({ sessions: [exampleSession()] });

    expect(screen.getByRole("heading", { level: 1, name: "공부 결과" })).toBeInTheDocument();
    expect(screen.getByText("순공시간")).toBeInTheDocument();
    expect(screen.getByText("1시간 24분")).toBeInTheDocument();
    expect(screen.getByText("82% 집중")).toBeInTheDocument();
    expect(screen.getByText("총 공부 1시간 42분 · 21:03 – 22:48")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "확인" })).toBeInTheDocument();
  });

  it("집중률은 '집중률 N%'가 아니라 'N% 집중' 형식이다 — 필/헤더 표기 규칙", () => {
    renderResult({ sessions: [exampleSession()] });

    expect(screen.queryByText(/집중률/)).not.toBeInTheDocument();
  });

  it("총 공부 시간과 시각 범위는 다를 수 있다 — 일시정지가 총 공부에서 빠지기 때문", () => {
    // 벽시계 105분인데 총 공부는 102분. 둘이 같아지면 제출 경로(WG1/WG4)가 깨졌다는 신호다.
    renderResult({ sessions: [exampleSession()] });

    expect(screen.getByText(/총 공부 1시간 42분/)).toBeInTheDocument();
    expect(screen.queryByText(/총 공부 1시간 45분/)).not.toBeInTheDocument();
  });

  it("서버 값을 화면에서 보정하지 않는다 — 받은 그대로 그린다", () => {
    renderResult({
      sessions: [exampleSession({ focusSec: 60, studySec: 6120, focusRate: 1 })],
    });

    expect(screen.getByText("1분")).toBeInTheDocument();
    expect(screen.getByText("1% 집중")).toBeInTheDocument();
  });
});

describe("ResultPage — 타임라인 카드", () => {
  it("바는 요약 라벨을 가진 이미지로 노출된다 — 시각 요소만으로 정보를 전달하지 않는다", () => {
    renderResult({ sessions: [exampleSession()] });

    expect(
      screen.getByRole("img", { name: "집중 1시간 24분, 비집중 18분, 일시정지 3분" }),
    ).toBeInTheDocument();
  });

  it("축 라벨은 세션 시작·종료 벽시계다", () => {
    renderResult({ sessions: [exampleSession()] });

    const card = screen.getByText("공부 타임라인").closest("section")!;
    expect(within(card).getByText("21:03")).toBeInTheDocument();
    expect(within(card).getByText("22:48")).toBeInTheDocument();
  });

  it("일시정지가 있으면 범례가 3색이다 — Figma의 2색은 반영 지연이다", () => {
    renderResult({ sessions: [exampleSession()] });

    const card = screen.getByText("공부 타임라인").closest("section")!;
    expect(within(card).getByText("집중")).toBeInTheDocument();
    expect(within(card).getByText("비집중")).toBeInTheDocument();
    expect(within(card).getByText("일시정지")).toBeInTheDocument();
  });

  it("일시정지가 0건이면 범례에서 빠진다", () => {
    renderResult({ sessions: [exampleSession({ events: [event("AWAY", 600, 300)] })] });

    const card = screen.getByText("공부 타임라인").closest("section")!;
    expect(within(card).queryByText("일시정지")).not.toBeInTheDocument();
  });

  it("비집중이 0이면 범례는 '집중'만 남는다", () => {
    renderResult({ sessions: [exampleSession({ events: [] })] });

    const card = screen.getByText("공부 타임라인").closest("section")!;
    expect(within(card).getByText("집중")).toBeInTheDocument();
    expect(within(card).queryByText("비집중")).not.toBeInTheDocument();
    expect(within(card).queryByText("일시정지")).not.toBeInTheDocument();
  });
});

describe("ResultPage — 비집중 통계 카드", () => {
  it("유형별 건수와 시간을 축약 없이 보여준다", () => {
    renderResult({ sessions: [exampleSession()] });
    const card = statsCard();

    expect(within(card).getByText("자리 이탈")).toBeInTheDocument();
    expect(within(card).getByText("2회 · 9분 40초")).toBeInTheDocument();
    expect(within(card).getByText("휴대폰 사용")).toBeInTheDocument();
    expect(within(card).getByText("2회 · 6분 12초")).toBeInTheDocument();
    expect(within(card).getByText("기기 조작")).toBeInTheDocument();
    expect(within(card).getByText("1회 · 2분 8초")).toBeInTheDocument();
  });

  it("S5 기록용 축약 표기(`휴대폰 N회`)를 쓰지 않는다", () => {
    renderResult({ sessions: [exampleSession()] });

    expect(screen.queryByText(/^휴대폰 \d/)).not.toBeInTheDocument();
  });

  it("타이틀 합계에서 일시정지를 제외한다 — 비집중 18분이지 21분이 아니다", () => {
    renderResult({ sessions: [exampleSession()] });

    expect(screen.getByText("비집중 18분")).toBeInTheDocument();
    expect(screen.queryByText("비집중 21분")).not.toBeInTheDocument();
  });

  it("일시정지 행은 비집중 3종 아래에 붙는다", () => {
    renderResult({ sessions: [exampleSession()] });
    const card = statsCard();

    expect(within(card).getByText("일시정지")).toBeInTheDocument();
    expect(within(card).getByText("1회 · 3분")).toBeInTheDocument();
  });

  it("일시정지가 0건이면 행 자체를 렌더하지 않는다 — 0회로 남기지 않는다", () => {
    renderResult({ sessions: [exampleSession({ events: [event("AWAY", 600, 300)] })] });

    expect(screen.queryByText("일시정지")).not.toBeInTheDocument();
    expect(screen.queryByText(/0회/)).not.toBeInTheDocument();
  });

  it("특정 비집중 유형만 0이면 그 행만 숨긴다", () => {
    renderResult({
      sessions: [exampleSession({ events: [event("AWAY", 600, 300), event("PAUSE", 2400, 180)] })],
    });
    const card = statsCard();

    expect(within(card).getByText("자리 이탈")).toBeInTheDocument();
    expect(within(card).queryByText("휴대폰 사용")).not.toBeInTheDocument();
    expect(within(card).queryByText("기기 조작")).not.toBeInTheDocument();
    expect(within(card).getByText("일시정지")).toBeInTheDocument();
  });

  it("비집중 3종이 모두 0이면 확정 문구로 대체한다", () => {
    renderResult({ sessions: [exampleSession({ events: [] })] });

    expect(screen.getByText("비집중 없이 이어간 공부예요")).toBeInTheDocument();
    expect(screen.queryByText(/^비집중 \d/)).not.toBeInTheDocument();
  });

  it("비집중 0 + 일시정지 1회 이상이면 문구 아래에 일시정지 행만 남는다", () => {
    // ⚠️ 정확한 레이아웃은 미정(SCR-S4) — 기본 구현을 고정해 회귀만 막는다.
    renderResult({ sessions: [exampleSession({ events: [event("PAUSE", 2400, 180)] })] });

    expect(screen.getByText("비집중 없이 이어간 공부예요")).toBeInTheDocument();
    expect(screen.getAllByText("일시정지").length).toBeGreaterThan(0);
    expect(screen.getByText("1회 · 3분")).toBeInTheDocument();
  });
});

describe("ResultPage — 확정 표기 회귀", () => {
  it("'화면 꺼짐' 라벨을 어디에도 노출하지 않는다 — 2026-07-26에 일시정지로 통합됐다", () => {
    renderResult({ sessions: [exampleSession()] });

    expect(screen.queryByText(/화면 꺼짐/)).not.toBeInTheDocument();
  });

  it("저장 실패·미저장 방어 UI를 만들지 않는다 — 실패 처리는 전부 S3 쪽 책임이다", () => {
    renderResult({ sessions: [exampleSession()] });

    expect(screen.queryByText(/저장/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 제출" })).not.toBeInTheDocument();
  });

  it("V1.0 범위 밖 액션(공유·내보내기)을 만들지 않는다", () => {
    renderResult({ sessions: [exampleSession()] });

    // 버튼은 닫기와 CTA 둘뿐이다.
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});

describe("ResultPage — 이탈 경로", () => {
  it("CTA '확인'은 홈으로 돌아간다", async () => {
    renderResult({ sessions: [exampleSession()] });

    await userEvent.click(screen.getByRole("button", { name: "확인" }));

    expect(screen.getByText("홈 화면")).toBeInTheDocument();
  });

  it("우상단 닫기는 CTA와 같은 동작이다", async () => {
    renderResult({ sessions: [exampleSession()] });

    await userEvent.click(screen.getByRole("button", { name: "닫기" }));

    expect(screen.getByText("홈 화면")).toBeInTheDocument();
  });
});

describe("ResultPage — state 없는 진입", () => {
  it("state가 없으면 데이터를 지어내지 않고 홈으로 되돌린다", () => {
    renderResult(undefined);

    expect(screen.getByText("홈 화면")).toBeInTheDocument();
    expect(screen.queryByText("공부 결과")).not.toBeInTheDocument();
  });

  it("빈 배열도 결과가 아니다", () => {
    renderResult({ sessions: [] });

    expect(screen.getByText("홈 화면")).toBeInTheDocument();
  });

  it("형태가 다른 state는 통과시키지 않는다 — 히스토리에는 남의 값도 들어올 수 있다", () => {
    renderResult({ sessions: [{ id: 1, statDate: "2026-07-25" }] });

    expect(screen.getByText("홈 화면")).toBeInTheDocument();
  });
});

describe("ResultPage — 자정(KST) 분할 세션", () => {
  it("배열이 여러 건이면 첫 항목만 그린다 — 합산하지 않는다(미정, 보수적 처리)", () => {
    const first = exampleSession();
    const second = exampleSession({
      id: 11,
      statDate: "2026-07-26",
      studySec: 1800,
      focusSec: 1800,
      focusRate: 100,
      events: [],
    });
    renderResult({ sessions: [first, second] });

    expect(screen.getByText("1시간 24분")).toBeInTheDocument();
    expect(screen.getByText("82% 집중")).toBeInTheDocument();
    // 합산했다면 총 공부가 2시간 12분이 된다.
    expect(screen.queryByText(/총 공부 2시간/)).not.toBeInTheDocument();
  });
});
