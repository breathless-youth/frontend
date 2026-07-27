import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { StudySessionListResponse, StudySessionSummary } from "@focuson/types";

import RecordsScreen from "../app/(tabs)/records";
import { listStudySessionStats } from "../lib/statsApi";
import { ensureUserRegistered } from "../lib/userApi";

/**
 * 화면 테스트는 `app/` 밖에 둔다 — `expo-router`의 라우트 컨텍스트 정규식이 `__tests__`·
 * `.test.tsx`를 걸러내지 않아 `app/` 아래에 두면 테스트 파일이 라우트로 등록된다
 * (`__tests__/permission-denied.test.tsx`와 같은 이유).
 *
 * 화면이 "오늘"을 기준으로 그려지므로 Date만 고정한다(타이머는 실제 구현을 그대로 쓴다).
 * 고정 시각 = KST 2026-07-26(일) 10:00.
 */
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
}));
jest.mock("../lib/statsApi", () => ({
  listStudySessionStats: jest.fn(),
  getStreak: jest.fn(),
}));
jest.mock("../lib/userApi", () => ({
  ensureUserRegistered: jest.fn(),
}));

const mockedEnsure = ensureUserRegistered as jest.MockedFunction<typeof ensureUserRegistered>;
const mockedStats = listStudySessionStats as jest.MockedFunction<typeof listStudySessionStats>;

/** 고정 오늘(KST 2026-07-26)부터 12일 연속 기록 — 기존 화면 mock과 동일한 시나리오. */
const STUDIED_DATES = [
  "2026-07-15",
  "2026-07-16",
  "2026-07-17",
  "2026-07-18",
  "2026-07-19",
  "2026-07-20",
  "2026-07-21",
  "2026-07-22",
  "2026-07-23",
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
];

const SESSION_TEMPLATES = [
  {
    startsAt: "08:55",
    endsAt: "11:02",
    studySec: 2 * 3600 + 7 * 60,
    focusSec: 3600 + 38 * 60,
    eventCounts: { AWAY: 2, PHONE: 1, DEVICE: 0, PAUSE: 0 },
  },
  {
    startsAt: "13:10",
    endsAt: "14:40",
    studySec: 3600 + 30 * 60,
    focusSec: 3600 + 12 * 60,
    eventCounts: { AWAY: 1, PHONE: 0, DEVICE: 0, PAUSE: 0 },
  },
  {
    startsAt: "16:20",
    endsAt: "17:30",
    studySec: 3600 + 10 * 60,
    focusSec: 48 * 60,
    eventCounts: { AWAY: 0, PHONE: 2, DEVICE: 0, PAUSE: 0 },
  },
];

function toUtcIso(dateKey: string, kstClock: string): string {
  return new Date(`${dateKey}T${kstClock}:00+09:00`).toISOString();
}

/** 서버 계약대로: 요청 날짜의 세션 + 그 달의 공부일 목록. 세션은 시작 시각 내림차순. */
function serverStatsResponse(dateKey: string): StudySessionListResponse {
  const hasRecord = STUDIED_DATES.includes(dateKey);
  const sessions: StudySessionSummary[] = hasRecord
    ? SESSION_TEMPLATES.map((t, index) => ({
        id: index + 1,
        statDate: dateKey,
        startedAt: toUtcIso(dateKey, t.startsAt),
        endedAt: toUtcIso(dateKey, t.endsAt),
        studySec: t.studySec,
        focusSec: t.focusSec,
        focusRate: Math.round((t.focusSec / t.studySec) * 1000) / 10,
        eventCounts: t.eventCounts,
      })).reverse()
    : [];
  const totalStudySec = sessions.reduce((sum, s) => sum + s.studySec, 0);
  const totalFocusSec = sessions.reduce((sum, s) => sum + s.focusSec, 0);
  const monthPrefix = dateKey.slice(0, 7);
  return {
    sessions,
    sessionCount: sessions.length,
    totalStudySec,
    totalFocusSec,
    longestFocusSec: sessions.reduce((max, s) => Math.max(max, s.focusSec), 0),
    focusRate: totalStudySec === 0 ? 0 : Math.round((totalFocusSec / totalStudySec) * 1000) / 10,
    totalEventCounts: sessions.reduce(
      (acc, s) => ({
        AWAY: acc.AWAY + s.eventCounts.AWAY,
        PHONE: acc.PHONE + s.eventCounts.PHONE,
        DEVICE: acc.DEVICE + s.eventCounts.DEVICE,
        PAUSE: acc.PAUSE + s.eventCounts.PAUSE,
      }),
      { AWAY: 0, PHONE: 0, DEVICE: 0, PAUSE: 0 },
    ),
    studiedDatesInMonth: STUDIED_DATES.filter((d) => d.startsWith(monthPrefix)),
  };
}

function renderScreen() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RecordsScreen />
    </QueryClientProvider>,
  );
}

async function renderRecords() {
  mockedEnsure.mockResolvedValue(7);
  mockedStats.mockImplementation(async (_userId, date) => serverStatsResponse(date));
  renderScreen();
  await screen.findByText("7월 26일 학습 요약");
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({
    doNotFake: [
      "cancelAnimationFrame",
      "cancelIdleCallback",
      "clearImmediate",
      "clearInterval",
      "clearTimeout",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "requestIdleCallback",
      "setImmediate",
      "setInterval",
      "setTimeout",
    ],
    now: new Date("2026-07-26T01:00:00.000Z"),
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("S5 · 기록", () => {
  it("연속 공부 배너·달력·요약·리스트를 확정 문구로 쌓아 보여준다", async () => {
    await renderRecords();

    expect(screen.getByText("기록")).toBeTruthy();
    expect(screen.getByText("12일 연속 공부 중")).toBeTruthy();
    expect(screen.getByText("내일도 10분만 하면 이어져요")).toBeTruthy();
    expect(screen.getByText("2026년 7월")).toBeTruthy();
    expect(screen.getByText("7월 26일 학습 요약")).toBeTruthy();
    expect(screen.getByText("공부 기록")).toBeTruthy();
  });

  it("요약 타일 4종을 glossary 노출 표기 그대로 쓴다", async () => {
    await renderRecords();

    expect(screen.getByText("순공시간")).toBeTruthy();
    expect(screen.getByText("총 공부 시간")).toBeTruthy();
    expect(screen.getByText("공부 횟수")).toBeTruthy();
    // `집중률`은 요약 타일 라벨 1개 + 세션 3건의 우측 지표 라벨 3개다.
    expect(screen.getAllByText("집중률")).toHaveLength(4);

    // 수치는 그래프가 아니라 텍스트로도 전달된다.
    expect(screen.getByText("3시간 38분")).toBeTruthy(); // 순공 합계
    expect(screen.getByText("3회")).toBeTruthy();
  });

  it("이벤트 칩은 횟수만 쓴다 — S4의 'N회 · 시간' 표기를 쓰지 않는다", async () => {
    await renderRecords();

    expect(screen.getByText("자리 이탈 2회")).toBeTruthy();
    expect(screen.getByText("휴대폰 1회")).toBeTruthy();
    expect(screen.queryByText(/자리 이탈 2회 ·/)).toBeNull();
    expect(screen.queryByText(/화면 꺼짐/)).toBeNull();
  });

  it("리스트를 최신순으로 고정 정렬한다(V1.0 확정)", async () => {
    await renderRecords();

    const metas = screen.getAllByText(/·\s총/).map((node) => String(node.props.children as string));

    expect(metas).toEqual([
      "16:20 – 17:30 · 총 1시간 10분",
      "13:10 – 14:40 · 총 1시간 30분",
      "08:55 – 11:02 · 총 2시간 7분",
    ]);
  });

  it("정렬 컨트롤은 표시만 하고 누를 수 없다", async () => {
    await renderRecords();

    expect(screen.getByText("최신순")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "최신순" })).toBeNull();
  });

  it("세션 아이템에 이동 핸들러를 달지 않는다(기록 상세 목적지 미확정)", async () => {
    await renderRecords();

    // 리스트 아이템이 버튼으로 노출되면 존재하지 않는 화면으로 가는 인상을 준다.
    expect(screen.queryByRole("button", { name: /집중률/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /1시간 38분/ })).toBeNull();
  });

  it("달력 날짜를 고르면 요약·리스트가 그 날짜 기준으로 갱신된다", async () => {
    await renderRecords();

    fireEvent.press(screen.getByRole("button", { name: "24일, 기록 있음" }));

    // 선택일이 바뀌면 그 날짜의 통계를 새로 조회한다(react-query) — 응답이 오기 전까지는
    // 잠깐 pending이라 즉시 단언 대신 findByText로 반영을 기다린다.
    expect(await screen.findByText("7월 24일 학습 요약")).toBeTruthy();
  });

  it("기록이 없는 날은 확정 빈 상태 문구를 보여준다", async () => {
    await renderRecords();

    // mock은 오늘부터 12일 연속이라 7월 1일에는 기록이 없다.
    fireEvent.press(screen.getByRole("button", { name: "1일, 기록 없음" }));

    // 위와 같은 이유로 새 날짜 조회 응답을 기다린 뒤 단언한다.
    expect(await screen.findByText("이날은 기록이 없어요")).toBeTruthy();
    expect(screen.getByText("기록이 있는 날에는 점이 표시돼요")).toBeTruthy();
  });

  it("미래 날짜는 비활성이라 눌러도 선택이 바뀌지 않는다", async () => {
    await renderRecords();

    const future = screen.getByRole("button", { name: "27일, 기록 없음" });
    expect(future.props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.press(future);
    expect(screen.getByText("7월 26일 학습 요약")).toBeTruthy();
  });

  it("월 이동은 달력만 바꾸고 선택일은 건드리지 않는다(2026-07-28 확정 정책)", async () => {
    await renderRecords();

    fireEvent.press(screen.getByRole("button", { name: "다음 달" }));
    expect(screen.getByText("2026년 8월")).toBeTruthy();
    expect(screen.getByText("7월 26일 학습 요약")).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "이전 달" }));
    expect(screen.getByText("2026년 7월")).toBeTruthy();
  });

  it("오늘 날짜 셀을 선택 상태로 전달한다", async () => {
    await renderRecords();

    expect(
      screen.getByRole("button", { name: "26일, 기록 있음" }).props.accessibilityState,
    ).toMatchObject({ selected: true });
  });

  it("다음 달로 넘기면 그 달 1일로 도트를 조회한다 — 선택일 요약은 유지", async () => {
    await renderRecords();

    fireEvent.press(screen.getByRole("button", { name: "다음 달" }));

    expect(screen.getByText("2026년 8월")).toBeTruthy();
    expect(screen.getByText("7월 26일 학습 요약")).toBeTruthy();
    await waitFor(() => expect(mockedStats).toHaveBeenCalledWith(7, "2026-08-01"));
  });

  it("첫 로딩 동안 스켈레톤을 보여준다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockImplementation(() => new Promise(() => undefined)); // 영원히 pending
    renderScreen();

    expect(await screen.findAllByLabelText("불러오는 중")).not.toHaveLength(0);
    expect(screen.queryByText("7월 26일 학습 요약")).toBeNull();
  });

  it("조회 실패 시 오류 문구와 다시 시도를 보여준다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockRejectedValue(new Error("network"));
    renderScreen();

    expect(await screen.findByText("기록을 불러오지 못했어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });
});
