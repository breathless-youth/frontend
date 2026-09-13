import type {
  StatusEventPayload,
  StudyEventStatus,
  StudySessionResponse,
} from "@focusmakers/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDY_DAYS_FROM } from "@/features/study-session/useResultSummary";
import { todayKstDateKey } from "@/lib/dateKst";
import { getPeriodStats, listStudySessionStats } from "@/lib/statsApi";

import { RESULT_REVEAL_DELAY_MS, ResultPage } from "../ResultPage";

/**
 * 요약 카드(BY-560)가 읽는 통계 API만 막는다 — 세션 자체는 여전히 라우터 state로 들어온다.
 * `HomeTabPage.test.tsx`와 같은 방식이다.
 */
vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: vi.fn(),
  getPeriodStats: vi.fn(),
}));
const mockedStats = vi.mocked(listStudySessionStats);
const mockedPeriod = vi.mocked(getPeriodStats);

/** 오늘 합계 3시간 36분(12960초) — 시안 스크린샷 값. */
const statsResponse = {
  sessions: [],
  sessionCount: 3,
  totalStudySec: 15000,
  totalFocusSec: 12960,
  longestFocusSec: 2528,
  focusRate: 86.4,
  totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 },
  studiedDatesInMonth: [],
};

/** 누적 공부일 23일 — 시안 스크린샷 값. 기록 있는 날 23개 + 기록 없는 날(0) 7개. */
const periodResponse = {
  from: STUDY_DAYS_FROM,
  to: todayKstDateKey(),
  compareFrom: null,
  compareTo: null,
  dailyList: Array.from({ length: 30 }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, "0")}`,
    studySec: i < 23 ? 600 : 0,
    focusSec: i < 23 ? 500 : 0,
  })),
  compareDailyList: [],
};

beforeEach(() => {
  mockedStats.mockResolvedValue(statsResponse);
  mockedPeriod.mockResolvedValue(periodResponse);
});

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

/**
 * 홈 리다이렉트를 관측하기 위한 프로브 — 실제 `HomeTabPage`를 끌어오지 않는다(쿼리 조회가 딸려온다).
 * 도착한 쿼리를 그대로 노출해 `?userId=N` 승계까지 검증한다.
 */
function HomeProbe() {
  const { search } = useLocation();
  return <p>홈 화면{search}</p>;
}

/** 기록(S5) 도착 관측용 — 브라우저 단독 모드의 `기록으로 가기`가 여기로 온다. */
function RecordsProbe() {
  const { search } = useLocation();
  return <p>기록 화면{search}</p>;
}

/**
 * 모션 축소 여부를 `matchMedia`로 심는다 — jsdom에는 `matchMedia`가 없어 `ResultPage`는 "축소
 * 아님"으로 본다.
 *
 * 기본은 **축소(true)**: 그러면 도장 연출·타이머 없이 처음부터 히어로·카드·CTA가 전부 그려져
 * 내용 검증이 시간과 무관해진다(BY-560). 연출 순서 자체는 아래 "도장 연출 → 공개" 블록이 축소
 * 아님으로 렌더해 가짜 타이머로 검증한다.
 */
function stubReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") && matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/**
 * `/`가 아니라 `/home`에 프로브를 둔다 — `/`는 개발용 데모 랜딩이고 앱 홈은 `/home`이다.
 * 이 테스트가 `/`에 프로브를 세워두는 바람에 "확인이 데모 페이지로 보낸다"는 BY-327 통합 버그를
 * 412개 테스트가 통째로 놓쳤다. 실제 라우트 계약과 같은 경로로만 관측한다.
 */
function renderResult(
  state: unknown,
  search = "?userId=7",
  { reducedMotion = true }: { reducedMotion?: boolean } = {},
) {
  stubReducedMotion(reducedMotion);
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <MemoryRouter initialEntries={[{ pathname: "/room/7/result", search, state }]}>
        <Routes>
          <Route path="/home" element={<HomeProbe />} />
          <Route path="/records" element={<RecordsProbe />} />
          <Route path="/room/:id/result" element={<ResultPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** 테스트마다 새 캐시 — 재시도를 꺼서 실패가 바로 드러나게 한다. */
function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function timelineCard() {
  return screen.getByText("공부 타임라인").closest<HTMLElement>('[data-slot="card"]')!;
}

describe("ResultPage — 완료 히어로 (BY-560)", () => {
  it("완료 타이틀·설명·순공시간 대형값·집중률 배지·총 공부를 시안 형식으로 그린다", () => {
    renderResult({ sessions: [exampleSession()] });

    expect(screen.getByRole("heading", { level: 1, name: "오늘 공부 완료!" })).toBeInTheDocument();
    expect(screen.getByText("끝까지 해낸 시간이 그대로 기록됐어요")).toBeInTheDocument();
    expect(screen.getByText("순공시간")).toBeInTheDocument();
    expect(screen.getByText("1시간 24분")).toBeInTheDocument();
    expect(screen.getByText("82% 집중")).toBeInTheDocument();
    // 접두어와 값은 색이 달라 두 span이다 — 문장은 한 단락으로 읽힌다.
    expect(screen.getByText("1시간 42분").closest("p")).toHaveTextContent("총 공부시간 1시간 42분");
  });

  it("예전 헤더(타이틀 '공부 결과'·우상단 닫기)는 시안에서 빠졌다", () => {
    renderResult({ sessions: [exampleSession()] });

    expect(screen.queryByText("공부 결과")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "닫기" })).not.toBeInTheDocument();
  });

  it("시각 범위는 히어로에 없다 — 타임라인 카드 축 라벨이 같은 값을 보여준다", () => {
    renderResult({ sessions: [exampleSession()] });

    expect(screen.queryByText(/21:03 – 22:48/)).not.toBeInTheDocument();
  });

  it("집중률은 '집중률 N%'가 아니라 'N% 집중' 형식이다 — 필/헤더 표기 규칙", () => {
    renderResult({ sessions: [exampleSession()] });

    expect(screen.queryByText(/집중률/)).not.toBeInTheDocument();
  });

  it("총 공부 시간과 벽시계 범위는 다를 수 있다 — 일시정지가 총 공부에서 빠지기 때문", () => {
    // 벽시계 105분인데 총 공부는 102분. 둘이 같아지면 제출 경로(WG1/WG4)가 깨졌다는 신호다.
    renderResult({ sessions: [exampleSession()] });

    expect(screen.getByText("1시간 42분")).toBeInTheDocument();
    expect(screen.queryByText("1시간 45분")).not.toBeInTheDocument();
  });

  it("서버 값을 화면에서 보정하지 않는다 — 받은 그대로 그린다", () => {
    renderResult({
      sessions: [exampleSession({ focusSec: 60, studySec: 6120, focusRate: 1 })],
    });

    expect(screen.getByText("1분")).toBeInTheDocument();
    expect(screen.getByText("1% 집중")).toBeInTheDocument();
  });
});

describe("ResultPage — 도장 연출 → 공개 (모션 축소 아님)", () => {
  /**
   * 연출 경로는 타이머(공개)·rAF(카운트업)·캔버스(색종이)를 쓴다. 타이머만 가짜로 돌리고
   * rAF·캔버스는 무동작으로 막는다 — jsdom의 getContext는 미구현 경고를 찍고, 실제 rAF는
   * 테스트 밖에서 setState를 일으킨다. 여기서 검증하는 것은 **무엇이 언제 보이는가**뿐이다.
   */
  function renderAnimated(state: unknown = { sessions: [exampleSession()] }) {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    return renderResult(state, "?userId=7", { reducedMotion: false });
  }

  it("공개 전에는 도장·히어로만 있고 카드와 CTA는 없다", () => {
    const { container } = renderAnimated();

    expect(screen.getByRole("heading", { level: 1, name: "오늘 공부 완료!" })).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeNull();
    expect(screen.queryByText("공부 타임라인")).not.toBeInTheDocument();
    expect(screen.queryByText("오늘 누적 순공시간")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "홈으로" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "기록으로 가기" })).not.toBeInTheDocument();
  });

  it("공개 시점이 되면 카드와 CTA 둘이 드러나고 인트로 블록은 접혀 접근성 트리에서 빠진다", () => {
    const { container } = renderAnimated();

    act(() => {
      vi.advanceTimersByTime(RESULT_REVEAL_DELAY_MS - 1);
    });
    expect(screen.queryByText("공부 타임라인")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByText("공부 타임라인")).toBeInTheDocument();
    expect(screen.getByText("오늘 누적 순공시간")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "홈으로" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "기록으로 가기" })).toBeInTheDocument();
    // 도장은 사라지고, 타이틀은 DOM에 남되(접힘 전환) 스크린리더에는 읽히지 않는다.
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, hidden: true })).toHaveTextContent(
      "오늘 공부 완료!",
    );
    // 순공시간은 접히지 않고 남는다.
    expect(screen.getByText("순공시간")).toBeInTheDocument();
  });

  it("연출 중 화면을 떠나면 공개 타이머를 걷는다 — 사라진 화면에 setState하지 않는다", () => {
    const { unmount } = renderAnimated();
    unmount();

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(RESULT_REVEAL_DELAY_MS);
      });
    }).not.toThrow();
  });
});

describe("ResultPage — 타임라인 카드", () => {
  it("바는 요약 라벨을 가진 이미지로 노출된다 — 시각 요소만으로 정보를 전달하지 않는다", () => {
    renderResult({ sessions: [exampleSession()] });

    expect(
      screen.getByRole("img", {
        name: "집중 1시간 24분, 자동 멈춤 18분, 일시정지 3분, 최고 집중 시간 42분",
      }),
    ).toBeInTheDocument();
  });

  /**
   * BY-560 시안(2026-09-14): 이벤트로 끊기지 않고 이어진 가장 긴 구간을 바 위 배지·바 안
   * 하이라이트·바 아래 행으로 보여준다. 예시 세션은 마지막 휴대폰 사용 뒤 42분이 가장 길다.
   */
  it("최고 집중 시간을 배지와 행으로 보여준다 — 값과 시각 범위가 함께 간다", () => {
    renderResult({ sessions: [exampleSession()] });
    const card = timelineCard();

    // 배지(장식, aria-hidden)와 행 라벨 — 둘 다 같은 문구를 쓴다.
    expect(within(card).getAllByText(/최고 집중 시간/).length).toBeGreaterThanOrEqual(2);
    expect(within(card).getByText("42분")).toBeInTheDocument();
    expect(within(card).getByText("22:05 – 22:48")).toBeInTheDocument();
  });

  it("이벤트가 세션 전체를 덮어 이어진 구간이 없으면 최고 집중 시간을 그리지 않는다", () => {
    renderResult({ sessions: [exampleSession({ events: [event("PAUSE", 0, 6300)] })] });

    expect(within(timelineCard()).queryByText(/최고 집중 시간/)).not.toBeInTheDocument();
  });

  it("축 라벨은 세션 시작·종료 벽시계다", () => {
    renderResult({ sessions: [exampleSession()] });

    const card = screen.getByText("공부 타임라인").closest<HTMLElement>('[data-slot="card"]')!;
    expect(within(card).getByText("21:03")).toBeInTheDocument();
    expect(within(card).getByText("22:48")).toBeInTheDocument();
  });

  it("일시정지가 있으면 범례가 3색이다 — Figma의 2색은 반영 지연이다", () => {
    renderResult({ sessions: [exampleSession()] });

    const card = screen.getByText("공부 타임라인").closest<HTMLElement>('[data-slot="card"]')!;
    expect(within(card).getByText("집중")).toBeInTheDocument();
    expect(within(card).getByText("자동 멈춤")).toBeInTheDocument();
    expect(within(card).getByText("일시정지")).toBeInTheDocument();
  });

  it("범례에 '비집중'이라는 말은 없다 — 2026-09-14부터 '자동 멈춤'이다", () => {
    renderResult({ sessions: [exampleSession()] });

    expect(screen.queryByText(/비집중/)).not.toBeInTheDocument();
  });

  it("일시정지가 0건이면 범례에서 빠진다", () => {
    renderResult({ sessions: [exampleSession({ events: [event("AWAY", 600, 300)] })] });

    const card = screen.getByText("공부 타임라인").closest<HTMLElement>('[data-slot="card"]')!;
    expect(within(card).queryByText("일시정지")).not.toBeInTheDocument();
  });

  it("자동 멈춤이 0이면 범례는 '집중'만 남는다", () => {
    renderResult({ sessions: [exampleSession({ events: [] })] });

    const card = screen.getByText("공부 타임라인").closest<HTMLElement>('[data-slot="card"]')!;
    expect(within(card).getByText("집중")).toBeInTheDocument();
    expect(within(card).queryByText("자동 멈춤")).not.toBeInTheDocument();
    expect(within(card).queryByText("일시정지")).not.toBeInTheDocument();
  });
});

describe("ResultPage — 누적 요약 카드 (BY-560)", () => {
  it("오늘 누적 순공시간은 오늘(KST) 서버 합계로 채운다", async () => {
    renderResult({ sessions: [exampleSession()] }, "?userId=7");

    expect(screen.getByText("오늘 누적 순공시간")).toBeInTheDocument();
    expect(await screen.findByText("3시간 36분")).toBeInTheDocument();
    expect(mockedStats).toHaveBeenCalledWith(7, todayKstDateKey());
  });

  /**
   * 누적 공부 일 수 = 지금까지 기록이 있는 날(KST)의 수(2026-09-14 사용자 확정). 스트릭 기준이
   * 아니라 기간 집계의 일별 배열에서 센다 — 서비스 시작 전부터 오늘까지 한 번에 묻는다.
   */
  it("누적 공부 일 수는 기간 집계에서 기록 있는 날을 센 값이다", async () => {
    renderResult({ sessions: [exampleSession()] }, "?userId=7");

    expect(screen.getByText("누적 공부 일 수")).toBeInTheDocument();
    expect(await screen.findByText("23일")).toBeInTheDocument();
    expect(mockedPeriod).toHaveBeenCalledWith(7, { from: STUDY_DAYS_FROM, to: todayKstDateKey() });
  });

  it("조회에 실패한 행은 숫자를 지어내지 않고 —로 둔다 — 재시도 버튼도 없다", async () => {
    mockedPeriod.mockRejectedValue(new Error("네트워크"));
    renderResult({ sessions: [exampleSession()] }, "?userId=7");

    expect(await screen.findByText("3시간 36분")).toBeInTheDocument();
    expect(await screen.findByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /다시/ })).not.toBeInTheDocument();
  });

  it("?userId가 없는 미저장 모드에서는 카드를 그리지 않는다 — 저장 안 된 세션의 누적은 없다", () => {
    renderResult({ sessions: [exampleSession()] }, "");

    expect(screen.queryByText("오늘 누적 순공시간")).not.toBeInTheDocument();
    expect(screen.queryByText("누적 공부 일 수")).not.toBeInTheDocument();
    expect(mockedStats).not.toHaveBeenCalled();
    expect(mockedPeriod).not.toHaveBeenCalled();
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

  it("V1.0 범위 밖 액션(공유·내보내기)을 만들지 않는다 — 액션은 CTA 둘뿐이다", () => {
    renderResult({ sessions: [exampleSession()] });

    /**
     * 버튼은 `홈으로`·`기록으로 가기` 둘뿐이다(BY-560; 전에는 닫기+확인). 2026-09-14에 펼침
     * 토글이 있던 비집중 통계 카드가 요약 카드로 바뀌어 화면에 다른 버튼이 없다.
     */
    const actions = screen.getAllByRole("button");

    expect(actions.map((button) => button.textContent)).toEqual(["홈으로", "기록으로 가기"]);
    expect(screen.queryByRole("button", { name: "확인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "계속" })).not.toBeInTheDocument();
  });
});

describe("ResultPage — 이탈 경로: 홈으로", () => {
  it("CTA '홈으로'는 데모 랜딩(/)이 아니라 홈(/home)으로 돌아간다", async () => {
    renderResult({ sessions: [exampleSession()] });

    await userEvent.click(screen.getByRole("button", { name: "홈으로" }));

    expect(screen.getByText(/^홈 화면/)).toBeInTheDocument();
  });

  it("홈으로 돌아갈 때 ?userId를 승계한다 — 잃으면 홈이 미저장 모드로 뜬다", async () => {
    renderResult({ sessions: [exampleSession()] }, "?userId=7");

    await userEvent.click(screen.getByRole("button", { name: "홈으로" }));

    expect(screen.getByText("홈 화면?userId=7")).toBeInTheDocument();
  });

  it("브리지가 없는 브라우저에서도 던지지 않는다 — 폴백 이동이 실제 복귀다", async () => {
    renderResult({ sessions: [exampleSession()] });

    await userEvent.click(screen.getByRole("button", { name: "홈으로" }));

    expect(screen.getByText(/^홈 화면/)).toBeInTheDocument();
  });

  /**
   * 2026-07-30 실기기 확인: 이 배선이 없으면 웹 라우터 이동만 실행되어 WebView 안에
   * `apps/web`의 웹 홈이 열리고, 네이티브 탭 홈으로는 돌아가지 않는다.
   */
  it("네이티브 브리지가 있으면 홈 복귀 신호도 함께 보낸다", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    renderResult({ sessions: [exampleSession()] });

    await userEvent.click(screen.getByRole("button", { name: "홈으로" }));

    expect(postMessage).toHaveBeenCalledWith(expect.stringContaining('"type":"navigate-home"'));
    expect(postMessage).not.toHaveBeenCalledWith(expect.stringContaining('"type":"navigate-tab"'));
  });
});

describe("ResultPage — 이탈 경로: 기록으로 가기 (BY-560)", () => {
  function sentTypes(postMessage: ReturnType<typeof vi.fn>): string[] {
    return postMessage.mock.calls.map(
      ([raw]) => (JSON.parse(raw as string) as { type: string }).type,
    );
  }

  it("브라우저 단독 모드에서는 웹 라우트 /records로 가고 ?userId를 승계한다", async () => {
    renderResult({ sessions: [exampleSession()] }, "?userId=7");

    await userEvent.click(screen.getByRole("button", { name: "기록으로 가기" }));

    expect(screen.getByText("기록 화면?userId=7")).toBeInTheDocument();
  });

  /**
   * 솔로 결과는 세션 `fullScreenModal` 안이다. 탭 전환(`navigate-tab`)만 보내면 모달이 그대로
   * 남으므로 모달을 닫는 `navigate-home`을 **먼저** 보내고, 발신처는 `study_result`로 실어
   * 네이티브 `tab_pressed.via`가 홈 카드 터치와 섞이지 않게 한다.
   */
  it("네이티브 솔로 결과에서는 모달 닫기 신호 뒤에 기록 탭 전환 신호를 보낸다", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    renderResult({ sessions: [exampleSession()] });

    await userEvent.click(screen.getByRole("button", { name: "기록으로 가기" }));

    expect(sentTypes(postMessage)).toEqual(["navigate-home", "navigate-tab"]);
    expect(postMessage).toHaveBeenCalledWith(expect.stringContaining('"tab":"records"'));
    expect(postMessage).toHaveBeenCalledWith(expect.stringContaining('"via":"study_result"'));
    // 웹뷰 안 문서는 홈으로 되돌려 둔다 — 모달이 닫혀 사라지므로 브라우저 폴백과 같은 경로다.
    expect(screen.getByText(/^홈 화면/)).toBeInTheDocument();
  });
});

describe("ResultPage — state 없는 진입", () => {
  it("state가 없으면 데이터를 지어내지 않고 홈으로 되돌린다", () => {
    renderResult(undefined);

    expect(screen.getByText(/^홈 화면/)).toBeInTheDocument();
    expect(screen.queryByText("오늘 공부 완료!")).not.toBeInTheDocument();
  });

  it("네이티브에서는 state 없는 진입도 홈 복귀 신호를 보낸다 — 웹 이동만으로는 세션 모달에 갇힌다(BY-436)", () => {
    // 렌더러 사망 복원이 이 화면을 state 없이 다시 열 수 있다. 웹 <Navigate/>는 세션
    // fullScreenModal 안의 웹 홈을 열 뿐이라, navigate-home이 없으면 뒤로가기까지 잠긴
    // 모달에서 나갈 방법이 없다.
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    renderResult(undefined);

    expect(postMessage).toHaveBeenCalledWith(expect.stringContaining('"type":"navigate-home"'));
  });

  it("state 없는 되돌림도 ?userId를 승계한다 — CTA 경로와 규칙이 갈리지 않는다", () => {
    renderResult(undefined, "?userId=7");

    expect(screen.getByText("홈 화면?userId=7")).toBeInTheDocument();
  });

  it("빈 배열도 결과가 아니다", () => {
    renderResult({ sessions: [] });

    expect(screen.getByText(/^홈 화면/)).toBeInTheDocument();
  });

  it("형태가 다른 state는 통과시키지 않는다 — 히스토리에는 남의 값도 들어올 수 있다", () => {
    renderResult({ sessions: [{ id: 1, statDate: "2026-07-25" }] });

    expect(screen.getByText(/^홈 화면/)).toBeInTheDocument();
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
    expect(screen.queryByText("2시간 12분")).not.toBeInTheDocument();
  });
});

/** 소셜 홈 리다이렉트 관측용 프로브 — 도착 쿼리까지 노출해 `?userId=N` 승계를 검증한다. */
function SocialProbe() {
  const { search } = useLocation();
  return <p>소셜 홈{search}</p>;
}

/**
 * 소셜 결과 라우트로 진입한다. 목적지는 state가 아니라 이 경로에서 판단되므로, state를
 * 비워도(유실) 소셜 홈으로 복귀해야 한다.
 */
function renderResultAtSocial(state: unknown, search = "?userId=7") {
  stubReducedMotion(true);
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <MemoryRouter initialEntries={[{ pathname: "/social/room/42/result", search, state }]}>
        <Routes>
          <Route path="/home" element={<HomeProbe />} />
          <Route path="/social" element={<SocialProbe />} />
          <Route path="/records" element={<RecordsProbe />} />
          <Route path="/social/room/:roomId/result" element={<ResultPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ResultPage — 소셜 결과의 목적지", () => {
  it("소셜 결과 라우트에서 '홈으로'는 소셜 홈으로 보낸다", async () => {
    const user = userEvent.setup();
    renderResultAtSocial({ sessions: [exampleSession()] });

    await user.click(screen.getByRole("button", { name: "홈으로" }));

    expect(screen.getByText("소셜 홈?userId=7")).toBeInTheDocument();
  });

  it("소셜 결과에서는 홈 복귀 신호를 보내지 않는다 — 소셜룸은 탭 웹뷰라 모달이 없다", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    const user = userEvent.setup();
    renderResultAtSocial({ sessions: [exampleSession()] });

    await user.click(screen.getByRole("button", { name: "홈으로" }));

    expect(postMessage).not.toHaveBeenCalledWith(expect.stringContaining('"type":"navigate-home"'));
    expect(screen.getByText(/^소셜 홈/)).toBeInTheDocument();
  });

  /**
   * 소셜 결과는 소셜 탭 웹뷰 안이다. 탭 전환만 네이티브에 맡기고 모달 닫기 신호는 보내지
   * 않는다(보내면 홈 탭으로 튕긴다). 웹뷰 안 문서는 소셜 홈으로 되돌려 둔다 — 결과 화면에
   * 머문 채 남으면 다음에 소셜 탭을 열 때 끝난 결과가 다시 보인다.
   */
  it("네이티브 소셜 결과에서 '기록으로 가기'는 탭 전환 신호만 보내고 웹뷰는 소셜 홈으로 돌린다", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    const user = userEvent.setup();
    renderResultAtSocial({ sessions: [exampleSession()] });

    await user.click(screen.getByRole("button", { name: "기록으로 가기" }));

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(expect.stringContaining('"type":"navigate-tab"'));
    expect(postMessage).toHaveBeenCalledWith(expect.stringContaining('"via":"study_result"'));
    expect(screen.getByText("소셜 홈?userId=7")).toBeInTheDocument();
  });

  it("브라우저 단독 모드의 소셜 결과에서 '기록으로 가기'는 웹 라우트 /records로 간다", async () => {
    const user = userEvent.setup();
    renderResultAtSocial({ sessions: [exampleSession()] });

    await user.click(screen.getByRole("button", { name: "기록으로 가기" }));

    expect(screen.getByText("기록 화면?userId=7")).toBeInTheDocument();
  });

  it("state가 유실돼도 소셜 결과는 소셜 홈으로 복귀하고 홈 복귀 신호를 보내지 않는다", () => {
    // 렌더러 사망 복원·새로고침으로 state가 사라져도 경로가 소셜 결과이면 소셜 홈으로
    // 되돌린다. navigate-home은 솔로 모달 탈출용이라 여기서 보내면 홈 탭으로 튕긴다.
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    renderResultAtSocial(undefined);

    expect(screen.getByText(/^소셜 홈/)).toBeInTheDocument();
    expect(postMessage).not.toHaveBeenCalledWith(expect.stringContaining('"type":"navigate-home"'));
  });

  it("솔로 결과 라우트에서 '홈으로'는 앱 홈으로 보내고 홈 복귀 신호를 보낸다", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    const user = userEvent.setup();
    renderResult({ sessions: [exampleSession()] });

    await user.click(screen.getByRole("button", { name: "홈으로" }));

    expect(screen.getByText(/^홈 화면/)).toBeInTheDocument();
    expect(postMessage).toHaveBeenCalledWith(expect.stringContaining('"type":"navigate-home"'));
  });
});
