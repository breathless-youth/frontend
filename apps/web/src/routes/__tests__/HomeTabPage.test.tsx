import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  NoticeResponse,
  SessionRecoveryResponse,
  StudySessionListResponse,
  SubjectResponse,
} from "@focusmakers/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BrowserRouter,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import type * as TokenSourceModule from "@/lib/auth/tokenSource";
import type { TokenSource } from "@/lib/auth/tokenSource";
import type * as SubjectApi from "@/lib/subjectApi";
import type * as ToastModule from "@/lib/toast";

import { __resetNativeDateBarForTests } from "@/features/home/nativeHomeDateBar";
import { hasCreatedSubject, markSubjectCreated } from "@/features/home/subjectHistory";
import {
  addDaysToDateKey,
  dayTitleWithWeekday,
  kstDateKey,
} from "@/features/records/recordsFormat";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { __resetRankingTabForTests } from "@/lib/rankingCapability";
import { FIXTURE_UNSEEN_ONE } from "@/lib/rankingFixtures";
import { getStreak, listStudySessionStats } from "@/lib/statsApi";
import { useBlockForwardGestureIntoFullScreen } from "@/lib/historyGuard";
import { useNativeTabBarSync } from "@/lib/nativeTabBar";
import { createSubject, listSubjects, renameSubject, reorderSubjects } from "@/lib/subjectApi";
import { __resetTabBarPlayForTests } from "@/lib/tabBarPlayCapability";
import { hasShownRecoveryThisLaunch } from "@/features/study-session/recoveryLaunchStore";
import { readStartSubject, saveStartSubject } from "@/features/study-session/startSubject";
import { LAUNCH_SIGNAL_WAIT_MS } from "@/features/study-session/useLaunchSessionRecovery";
import { HomeTabPage } from "@/routes/HomeTabPage";

/** 옛 세션 마감은 자기 테스트가 따로 있다 — 여기서는 결과만 조작한다. */
const closeStaleSession = vi.hoisted(() =>
  vi.fn<() => Promise<SessionRecoveryResponse | null>>(() => Promise.resolve(null)),
);

vi.mock("@/features/study-session/closeStaleSession", () => ({ closeStaleSession }));

const analytics = vi.hoisted(() => ({
  trackFocusStartTapped: vi.fn(),
  trackSubjectItemAdded: vi.fn(),
  trackHomeDateSelected: vi.fn(),
}));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  ...analytics,
}));

vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: vi.fn(),
  getStreak: vi.fn(),
}));

vi.mock("@/lib/subjectApi", async (importOriginal) => ({
  ...(await importOriginal<typeof SubjectApi>()),
  listSubjects: vi.fn(),
  createSubject: vi.fn(),
  renameSubject: vi.fn(),
  reorderSubjects: vi.fn(),
}));

/** 저장 실패 알림은 토스트로 나간다. 토스트 그리기는 자기 테스트가 본다. */
const showToast = vi.hoisted(() => vi.fn());
vi.mock("@/lib/toast", async (importOriginal) => ({
  ...(await importOriginal<typeof ToastModule>()),
  showToast,
}));

// jsdom에는 PointerEvent가 없어 카드 밀기 판정에 쓰는 좌표와 isPrimary를 채운다.
class TestPointerEvent extends MouseEvent {
  readonly isPrimary = true;
  readonly pointerId = 1;
  readonly pointerType = "touch";
}
window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;

/** 홈 공지는 자기 테스트가 따로 본다. 기본은 띄울 공지가 없게 두고 복구 창 순서 테스트만 바꾼다. */
const getActiveNotices = vi.hoisted(() => vi.fn(() => Promise.resolve<NoticeResponse[]>([])));
vi.mock("@/lib/noticeApi", () => ({ getActiveNotices }));

/**
 * 홈 랭킹 팝업 응답
 *
 * 팝업 자체는 자기 테스트가 따로 본다.
 * 기본은 띄울 것이 없게 두고 순서 테스트만 바꾼다.
 */
const rankingApi = vi.hoisted(() => ({
  getRankingRecordsUnseen: vi.fn(),
  postRankingRecordsSeen: vi.fn(),
}));
vi.mock("@/lib/rankingApi", () => rankingApi);

vi.mock("@/lib/ddayApi", () => ({
  getDday: vi.fn(() => Promise.resolve(null)),
  putDday: vi.fn(),
  deleteDday: vi.fn(),
}));

/**
 * 홈이 그날을 그린 뒤 부르는 Vision 자원 미리 받기
 *
 * 받기 자체는 자기 테스트가 본다.
 */
const prefetchVisionAssets = vi.hoisted(() => vi.fn());

vi.mock("@/features/study-session/vision/prefetchVisionAssets", () => ({
  prefetchVisionAssets,
}));

// 타임랩스 유무 user property는 기기 저장소를 읽는다.
// 자기 테스트가 따로 본다.
vi.mock("@/features/timelapse/useTimelapseUserProperty", () => ({
  useTimelapseUserProperty: vi.fn(),
}));

// 기본은 출처가 없는 구 앱·브라우저 단독 문서다.
// D-Day 테스트만 가짜 출처를 끼운다.
const tokenSourceMock = vi.hoisted(() => ({ source: null as TokenSource | null }));

vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof TokenSourceModule>()),
  getTokenSource: () => tokenSourceMock.source,
}));

const mockedStats = vi.mocked(listStudySessionStats);
const mockedStreak = vi.mocked(getStreak);
const mockedListSubjects = vi.mocked(listSubjects);
const mockedCreateSubject = vi.mocked(createSubject);

const TODAY = kstDateKey();
const YESTERDAY = addDaysToDateKey(TODAY, -1);

const EMPTY_DAY: StudySessionListResponse = {
  sessions: [],
  sessionCount: 0,
  totalStudySec: 0,
  totalFocusSec: 0,
  longestFocusSec: 0,
  focusRate: 0,
  totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, SLEEP: 0, PAUSE: 0 },
  studiedDatesInMonth: [],
};

/** 그 날짜 10:00~12:00(KST)에 국어로 1시간 30분 순공한 세션 하나. */
function studiedDay(dateKey: string): StudySessionListResponse {
  const startedAt = `${dateKey}T01:00:00Z`;
  const endedAt = `${dateKey}T03:00:00Z`;
  return {
    ...EMPTY_DAY,
    sessions: [
      {
        id: 1,
        statDate: dateKey,
        startedAt,
        endedAt,
        studySec: 7200,
        focusSec: 5400,
        focusRate: 75,
        eventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, SLEEP: 0, PAUSE: 0 },
        subjectSegments: [{ subjectId: 1, startedAt, endedAt, studySec: 7200, focusSec: 5400 }],
      },
    ],
    sessionCount: 1,
    totalStudySec: 7200,
    totalFocusSec: 5400,
    subjects: [{ id: 1, name: "국어", colorIndex: 0, deleted: false }],
  };
}

const subject = (id: number, name: string): SubjectResponse => ({
  id,
  name,
  colorIndex: id,
  studySec: 0,
  focusSec: 0,
  tasks: [],
});

const SUBJECTS = [subject(1, "국어"), subject(2, "수학")];

/**
 * 기존 팝업 테스트가 쓰던 이름
 *
 * 그날 기록 없이 빈 하루를 돌려준다.
 */
const statsResponse = EMPTY_DAY;

const RECOVERED = {
  statDate: "2026-08-27",
  startedAt: "2026-08-27T12:03:00Z",
  endedAt: "2026-08-27T13:48:00Z",
  studySec: 6300,
  focusSec: 5040,
};

const RECOVERY_TITLE = "저장되지 않은 기록을 복구했어요";

const NOTICE: NoticeResponse = {
  id: 3,
  title: "점검 안내",
  content: "c",
  imageUrl: null,
  audience: "ALL",
  badgeText: null,
  buttonText: null,
  buttonUrl: null,
};

const TOKEN_SOURCE = {
  getUserId: () => 7,
  getAccessToken: () => "token",
  hasSettled: () => true,
  subscribe: () => () => {},
} as unknown as TokenSource;

/** 네이티브가 주입하는 것과 같은 경로로 메시지를 흘린다. */
function emitNative(raw: string) {
  const receiver = (globalThis as unknown as Record<string, ((raw: string) => void) | undefined>)[
    NATIVE_MESSAGE_ENTRY
  ];
  receiver?.(raw);
}

function emitAppLaunched() {
  emitNative('{"type":"app-launched","atMs":1}');
}

function renderHome(path = "/home?userId=7") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <HomeTabPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** 이동한 목적지의 경로+쿼리를 그대로 노출하는 스텁. */
function LocationProbe({ testId }: { testId: string }) {
  const location = useLocation();
  return <div data-testid={testId}>{location.pathname + location.search}</div>;
}

function renderHomeWithRoutes(path = "/home?userId=7") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/home" element={<HomeTabPage />} />
          <Route path="/room/:id" element={<LocationProbe testId="room-stub" />} />
          <Route path="/manual-record" element={<LocationProbe testId="manual-stub" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// 과목 추가 시트는 나눠 받는다.
// 전체 스위트 부하에서 첫 열기가 findBy 기본 1초를 넘기지 않게 미리 받아 둔다.
beforeAll(async () => {
  await import("@/features/home/AddSubjectSheet");
});

// 파일의 모든 describe가 같은 기본값에서 시작하게 맨 바깥에 둔다.
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  closeStaleSession.mockResolvedValue(null);
  getActiveNotices.mockImplementation(() => Promise.resolve([]));
  rankingApi.getRankingRecordsUnseen.mockResolvedValue({ total: 0, records: [] });
  rankingApi.postRankingRecordsSeen.mockResolvedValue(undefined);
  mockedStats.mockImplementation((dateKey: string) =>
    Promise.resolve(dateKey === TODAY || dateKey === YESTERDAY ? studiedDay(dateKey) : EMPTY_DAY),
  );
  mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });
  mockedListSubjects.mockResolvedValue(SUBJECTS);
});

afterEach(() => {
  tokenSourceMock.source = null;
  window.history.replaceState(null, "", "/");
  __resetTabBarPlayForTests();
});

describe("HomeTabPage — 오늘", () => {
  it("날짜 제목·순공과 과목 줄(재생 버튼, 그날 순공)을 보여 준다", async () => {
    renderHome();

    expect(
      screen.getByRole("heading", { level: 1, name: dayTitleWithWeekday(TODAY) }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "순공 1시간 30분" })).toBeInTheDocument();
    const rows = within(await screen.findByRole("list", { name: "과목" })).getAllByRole("listitem");
    expect(within(rows[0]!).getByText("국어")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("1시간 30분")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("수학")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("0분")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "국어 공부 시작" })).toBeInTheDocument();
  });

  it("순공을 누르면 총 공부가 보이고 3초 뒤 순공으로 돌아온다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderHome();

      fireEvent.click(await screen.findByRole("button", { name: "순공 1시간 30분" }));
      expect(screen.getByRole("button", { name: "총 공부 2시간" })).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(screen.getByRole("button", { name: "순공 1시간 30분" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("과목 재생 버튼은 그 과목을 남기고 쿼리를 승계해 세션을 열며 출처를 home_subject로 남긴다", async () => {
    renderHomeWithRoutes();

    fireEvent.click(await screen.findByRole("button", { name: "수학 공부 시작" }));

    expect((await screen.findByTestId("room-stub")).textContent).toBe("/room/1?userId=7");
    expect(readStartSubject(Date.now())).toMatchObject({ userId: 7, subjectId: 2 });
    expect(analytics.trackFocusStartTapped).toHaveBeenCalledWith("home_subject");
  });

  it("홈이 다시 보이면 앞서 실패한 시작이 남긴 과목을 삭제한다", async () => {
    renderHome();
    await screen.findByRole("button", { name: "국어 공부 시작" });
    saveStartSubject(7, 1, Date.now());

    act(() => {
      emitNative('{"type":"tab-focus","focused":false,"atMs":2}');
    });
    expect(readStartSubject(Date.now())).not.toBeNull();
    act(() => {
      emitNative('{"type":"tab-focus","focused":true,"atMs":3}');
    });

    expect(readStartSubject(Date.now())).toBeNull();
  });

  it("그날을 그린 뒤에야 Vision 자원을 미리 받는다", async () => {
    let resolveToday: (value: StudySessionListResponse) => void = () => {};
    mockedStats.mockImplementation((dateKey: string) =>
      dateKey === TODAY
        ? new Promise((resolve) => {
            resolveToday = resolve;
          })
        : Promise.resolve(EMPTY_DAY),
    );

    renderHome();
    await waitFor(() => expect(mockedStats).toHaveBeenCalledWith(TODAY));
    expect(prefetchVisionAssets).not.toHaveBeenCalled();

    resolveToday(studiedDay(TODAY));
    await waitFor(() => expect(prefetchVisionAssets).toHaveBeenCalled());
  });

  it("그날 기록을 불러오지 못하면 오류와 다시 시도를 보여 준다", async () => {
    mockedStats.mockRejectedValue(new Error("network"));

    renderHome();

    expect(await screen.findByText("기록을 불러오지 못했어요")).toBeInTheDocument();
    expect(prefetchVisionAssets).not.toHaveBeenCalled();
  });

  it("과목 목록을 불러오지 못하면 오류를 보이고 다시 시도하면 목록이 생긴다", async () => {
    mockedStats.mockResolvedValue(EMPTY_DAY);
    mockedListSubjects.mockRejectedValueOnce(new Error("network"));

    renderHome();

    expect(await screen.findByText("과목을 불러오지 못했어요")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("button", { name: "국어 공부 시작" })).toBeInTheDocument();
    expect(screen.queryByText("과목을 불러오지 못했어요")).not.toBeInTheDocument();
  });

  it("그날 기록 줄이 있어도 과목 목록을 불러오지 못하면 기록 줄 아래에 오류와 다시 시도를 보인다", async () => {
    mockedListSubjects.mockRejectedValueOnce(new Error("network"));

    renderHome();

    expect(await screen.findByText("과목을 불러오지 못했어요")).toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "과목" })).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(["국어순공1시간 30분"]);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("button", { name: "국어 공부 시작" })).toBeInTheDocument();
    expect(screen.queryByText("과목을 불러오지 못했어요")).not.toBeInTheDocument();
  });

  it("세션이 닫히면 과목 목록을 다시 받는다", async () => {
    renderHome();
    await screen.findByRole("button", { name: "국어 공부 시작" });
    const calls = mockedListSubjects.mock.calls.length;

    mockedListSubjects.mockResolvedValue([...SUBJECTS, subject(3, "영어")]);
    act(() => {
      emitNative('{"type":"session-closed","atMs":2}');
    });

    expect(await screen.findByRole("button", { name: "영어 공부 시작" })).toBeInTheDocument();
    expect(mockedListSubjects.mock.calls.length).toBeGreaterThan(calls);
  });

  it("지운 카드(연속 공부·통계·집중 시작·초대·최근 타임랩스·플래너 버튼)가 없다", async () => {
    tokenSourceMock.source = TOKEN_SOURCE;
    renderHome("/home");

    await screen.findByRole("button", { name: "국어 공부 시작" });
    expect(screen.queryByText(/연속 공부 중/)).not.toBeInTheDocument();
    expect(screen.queryByText("집중률")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "집중 시작" })).not.toBeInTheDocument();
    expect(screen.queryByText(/그룹 스터디하러 이동/)).not.toBeInTheDocument();
    expect(screen.queryByText("최근 타임랩스")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "플래너" })).not.toBeInTheDocument();
  });
});

describe("HomeTabPage — 날짜 줄", () => {
  it("오늘까지 30일만 있고 미래 날짜가 없다", async () => {
    renderHome();

    const days = within(screen.getByRole("group", { name: "날짜" })).getAllByRole("button");
    expect(days).toHaveLength(30);
    expect(days.at(-1)).toHaveAccessibleName(`${dayTitleWithWeekday(TODAY)}, 오늘`);
  });

  it("지난 날을 누르면 제목이 바뀌고 과목 줄이 재생 버튼 대신 색 막대가 된다", async () => {
    renderHome();
    await screen.findByRole("button", { name: "국어 공부 시작" });

    fireEvent.click(screen.getByRole("button", { name: dayTitleWithWeekday(YESTERDAY) }));

    expect(
      screen.getByRole("heading", { level: 1, name: dayTitleWithWeekday(YESTERDAY) }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "과목" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /공부 시작/ })).not.toBeInTheDocument();
    expect(analytics.trackHomeDateSelected).toHaveBeenCalledWith(1);
  });

  it("탭 바 재생 버튼이 없는 앱에서는 순공 시작이 과목 없이 세션을 연다", async () => {
    saveStartSubject(7, 1, Date.now());
    renderHomeWithRoutes();

    fireEvent.click(await screen.findByRole("button", { name: "순공 시작" }));

    expect((await screen.findByTestId("room-stub")).textContent).toBe("/room/1?userId=7");
    expect(readStartSubject(Date.now())).toBeNull();
    expect(analytics.trackFocusStartTapped).toHaveBeenCalledWith("home_fallback");
  });

  it("탭 바 재생 버튼이 있는 앱에서는 순공 시작이 없다", async () => {
    window.history.replaceState(null, "", "/home?userId=7&tabBarPlay=1");
    __resetTabBarPlayForTests();
    renderHome("/home?userId=7&tabBarPlay=1");

    await screen.findByRole("button", { name: "국어 공부 시작" });
    expect(screen.queryByRole("button", { name: "순공 시작" })).not.toBeInTheDocument();
  });
});

describe("HomeTabPage — 앱이 그리는 날짜 줄", () => {
  afterEach(() => {
    __resetNativeDateBarForTests();
  });

  it("앱에서 누른 날을 고르고 며칠 전인지 이벤트를 보내며 이미 고른 날은 넘긴다", async () => {
    window.history.replaceState(null, "", "/home?userId=7&nativeDateBar=1");
    __resetNativeDateBarForTests();
    renderHome("/home?userId=7&nativeDateBar=1");
    await screen.findByRole("button", { name: "국어 공부 시작" });
    const twoDaysAgo = addDaysToDateKey(TODAY, -2);

    act(() => emitNative(`{"type":"home-date-selected","dateKey":"${TODAY}","atMs":1}`));
    expect(analytics.trackHomeDateSelected).not.toHaveBeenCalled();

    act(() => emitNative(`{"type":"home-date-selected","dateKey":"${twoDaysAgo}","atMs":1}`));
    expect(analytics.trackHomeDateSelected).toHaveBeenCalledExactlyOnceWith(2);
    expect(
      screen.getByRole("heading", { level: 1, name: dayTitleWithWeekday(twoDaysAgo) }),
    ).toBeInTheDocument();
  });

  it("웹 날짜 줄에서 이미 고른 날을 다시 누르면 이벤트를 보내지 않는다", async () => {
    renderHome();
    await screen.findByRole("button", { name: "국어 공부 시작" });

    fireEvent.click(screen.getByRole("button", { name: `${dayTitleWithWeekday(TODAY)}, 오늘` }));

    expect(analytics.trackHomeDateSelected).not.toHaveBeenCalled();
  });
});

/** 앱 탭 바 동기화는 App이 한 번 건다. 상태가 탭 바를 숨기는지 보려고 같이 그린다. */
function TabBarSync() {
  useNativeTabBarSync();
  return null;
}

function renderHomeWithTabBar(path = "/home?userId=7") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <TabBarSync />
        <HomeTabPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function sentMessages(postMessage: ReturnType<typeof vi.fn>) {
  return postMessage.mock.calls.map(
    ([raw]) => JSON.parse(raw as string) as { type: string; visible?: boolean; dates?: unknown[] },
  );
}

describe("HomeTabPage — 과목 카드 조작", () => {
  afterEach(() => {
    __resetNativeDateBarForTests();
    vi.unstubAllGlobals();
  });

  it("웹 메뉴의 과목 순서 변경은 날짜 줄과 헤더를 숨긴 순서 화면이고 완료하면 목록으로 돌아온다", async () => {
    renderHome();
    await screen.findByRole("button", { name: "국어 공부 시작" });

    await userEvent.click(screen.getByRole("button", { name: "과목 메뉴" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "과목 순서 변경" }));

    expect(screen.getByRole("heading", { level: 1, name: "과목 순서 변경" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "날짜" })).toBeNull();
    expect(screen.queryByRole("button", { name: /공부 시작/ })).toBeNull();
    expect(screen.getByRole("button", { name: "국어 순서 이동" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(await screen.findByRole("button", { name: "국어 공부 시작" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "날짜" })).toBeInTheDocument();
    // 순서를 바꾸지 않았으면 저장하지 않는다.
    expect(reorderSubjects).not.toHaveBeenCalled();
  });

  it("상태에 들어가면 history 항목을 하나 쌓고 뒤로 가기로 나간다", async () => {
    renderHome();
    await screen.findByRole("button", { name: "국어 공부 시작" });
    const before = window.history.state as unknown;

    await userEvent.click(screen.getByRole("button", { name: "과목 메뉴" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "과목 편집" }));
    expect(screen.getByRole("heading", { level: 1, name: "과목 편집" })).toBeInTheDocument();
    expect(window.history.state).toMatchObject({ homeMode: "edit" });
    expect(window.location.pathname).toBe("/");

    act(() => window.history.back());

    expect(await screen.findByRole("button", { name: "국어 공부 시작" })).toBeInTheDocument();
    expect(window.history.state).toEqual(before);
  });

  it("앱 메뉴 알림으로 들어가면 앱 날짜 줄에 빈 목록을 보내고 탭 바를 숨기며, 나오면 되돌린다", async () => {
    window.history.replaceState(null, "", "/home?userId=7&nativeDateBar=1");
    __resetNativeDateBarForTests();
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    renderHomeWithTabBar("/home?userId=7&nativeDateBar=1");
    await screen.findByRole("button", { name: "국어 공부 시작" });

    act(() => emitNative('{"type":"home-menu-action","action":"edit-subjects","atMs":1}'));

    expect(screen.getByRole("heading", { level: 1, name: "과목 편집" })).toBeInTheDocument();
    const inState = sentMessages(postMessage);
    expect(inState.filter((message) => message.type === "set-home-date-bar").at(-1)?.dates).toEqual(
      [],
    );
    expect(inState.filter((message) => message.type === "set-tab-bar").at(-1)?.visible).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "완료" }));
    await screen.findByRole("button", { name: "국어 공부 시작" });

    await waitFor(() => {
      const after = sentMessages(postMessage);
      expect(after.filter((message) => message.type === "set-tab-bar").at(-1)?.visible).toBe(true);
      expect(
        after.filter((message) => message.type === "set-home-date-bar").at(-1)?.dates,
      ).toHaveLength(30);
    });
  });

  it("편집 상태의 과목 추가는 과목 추가 시트를 연다", async () => {
    mockedCreateSubject.mockResolvedValue(subject(3, "영어"));
    renderHome();
    await screen.findByRole("button", { name: "국어 공부 시작" });
    await userEvent.click(screen.getByRole("button", { name: "과목 메뉴" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "과목 편집" }));

    await userEvent.click(screen.getByRole("button", { name: "과목 추가" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("카드를 밀어 직접 입력을 누르면 그 과목과 고른 날짜로 시간 직접 입력을 연다", async () => {
    renderHomeWithRoutes();
    await screen.findByRole("button", { name: "국어 공부 시작" });
    fireEvent.click(screen.getByRole("button", { name: dayTitleWithWeekday(YESTERDAY) }));
    const math = within(await screen.findByRole("list", { name: "과목" }))
      .getAllByRole("listitem")
      .find((row) => within(row).queryByText("수학") !== null)!;
    const surface = math.querySelector<HTMLElement>("[data-swipe-surface]")!;

    fireEvent.pointerDown(surface, { clientX: 200, clientY: 100 });
    fireEvent.pointerMove(surface, { clientX: 120, clientY: 101 });
    fireEvent.pointerMove(surface, { clientX: 50, clientY: 101 });
    fireEvent.pointerUp(surface, { clientX: 50, clientY: 101 });
    await userEvent.click(within(math).getByRole("button", { name: "직접 입력" }));

    expect((await screen.findByTestId("manual-stub")).textContent).toBe(
      `/manual-record?userId=7&date=${YESTERDAY}&entry=home&subject=2`,
    );
  });

  it("지난 날에서 직접 입력을 열었다 뒤로 돌아오면 그 날을 고른 채 다시 연다", async () => {
    function ManualBack() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => void navigate(-1)}>
          뒤로
        </button>
      );
    }
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={["/home?userId=7"]}>
          <Routes>
            <Route path="/home" element={<HomeTabPage />} />
            <Route path="/manual-record" element={<ManualBack />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole("button", { name: "국어 공부 시작" });
    fireEvent.click(screen.getByRole("button", { name: dayTitleWithWeekday(YESTERDAY) }));
    const math = within(await screen.findByRole("list", { name: "과목" }))
      .getAllByRole("listitem")
      .find((row) => within(row).queryByText("수학") !== null)!;
    await userEvent.click(within(math).getByRole("button", { name: "직접 입력" }));

    await userEvent.click(await screen.findByRole("button", { name: "뒤로" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: dayTitleWithWeekday(YESTERDAY) }),
    ).toBeInTheDocument();
  });

  it("주소의 date로 열면 그 날을 고른 채 열고, 30일 밖이면 오늘로 연다", async () => {
    const { unmount } = renderHome(`/home?userId=7&date=${YESTERDAY}`);
    expect(
      screen.getByRole("heading", { level: 1, name: dayTitleWithWeekday(YESTERDAY) }),
    ).toBeInTheDocument();
    unmount();

    renderHome("/home?userId=7&date=2020-01-01");
    expect(
      screen.getByRole("heading", { level: 1, name: dayTitleWithWeekday(TODAY) }),
    ).toBeInTheDocument();
  });

  it("실제 브라우저 라우터에서 상태에 들어갔다 뒤로 가면 /home과 과목 목록이 남고 가드가 되돌리지 않는다", async () => {
    window.history.replaceState(null, "", "/home?userId=7");
    const go = vi.spyOn(window.history, "go");
    function ForwardGuard() {
      useBlockForwardGestureIntoFullScreen();
      return null;
    }
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <BrowserRouter>
          <ForwardGuard />
          <Routes>
            <Route path="/home" element={<HomeTabPage />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole("button", { name: "국어 공부 시작" });

    await userEvent.click(screen.getByRole("button", { name: "과목 메뉴" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "과목 편집" }));
    expect(screen.getByRole("heading", { level: 1, name: "과목 편집" })).toBeInTheDocument();
    act(() => window.history.back());

    expect(await screen.findByRole("button", { name: "국어 공부 시작" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "과목" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/home");
    expect(go).not.toHaveBeenCalled();
    go.mockRestore();
  });

  it("날짜를 바꾸면 펼친 카드가 접힌 채로 다시 그려진다", async () => {
    renderHome();
    await userEvent.click(await screen.findByRole("button", { name: "국어 할 일" }));
    expect(screen.getByRole("button", { name: "국어 할 일" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: dayTitleWithWeekday(YESTERDAY) }));
    await screen.findByRole("heading", { level: 1, name: dayTitleWithWeekday(YESTERDAY) });
    fireEvent.click(screen.getByRole("button", { name: `${dayTitleWithWeekday(TODAY)}, 오늘` }));

    expect(await screen.findByRole("button", { name: "국어 할 일" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("상태에서 순서 저장이 실패하면 알리고 과목 목록을 다시 받는다", async () => {
    vi.mocked(reorderSubjects).mockRejectedValueOnce(new Error("network"));
    renderHome();
    await screen.findByRole("button", { name: "국어 공부 시작" });
    await userEvent.click(screen.getByRole("button", { name: "과목 메뉴" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "과목 순서 변경" }));
    const handle = screen.getByRole("button", { name: "국어 순서 이동" });
    act(() => handle.focus());
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    const loadsBefore = mockedListSubjects.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "완료" }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("저장하지 못했어요. 다시 시도해주세요"),
    );
    expect(reorderSubjects).toHaveBeenCalledWith({ subjectIds: [2, 1] });
    await waitFor(() => expect(mockedListSubjects.mock.calls.length).toBeGreaterThan(loadsBefore));
  });

  it("편집 상태에서 이름 저장이 실패하면 알리고 원래 이름으로 돌아온다", async () => {
    vi.mocked(renameSubject).mockRejectedValueOnce(new Error("network"));
    renderHome();
    await screen.findByRole("button", { name: "국어 공부 시작" });
    await userEvent.click(screen.getByRole("button", { name: "과목 메뉴" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "과목 편집" }));
    const loadsBefore = mockedListSubjects.mock.calls.length;

    const input = screen.getByRole("textbox", { name: "국어 이름" });
    await userEvent.clear(input);
    await userEvent.type(input, "문학{Enter}");

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("저장하지 못했어요. 다시 시도해주세요"),
    );
    await waitFor(() => expect(mockedListSubjects.mock.calls.length).toBeGreaterThan(loadsBefore));
    expect(await screen.findByRole("textbox", { name: "국어 이름" })).toHaveValue("국어");
  });

  it("과목 목록을 받기 전에는 웹 메뉴 항목이 비활성이라 상태에 들어가지 않는다", async () => {
    mockedListSubjects.mockReturnValue(new Promise(() => {}));
    renderHome();

    await userEvent.click(await screen.findByRole("button", { name: "과목 메뉴" }));
    const reorder = screen.getByRole("menuitem", { name: "과목 순서 변경" });
    expect(reorder).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "과목 편집" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await userEvent.click(reorder);

    expect(screen.queryByRole("heading", { level: 1, name: "과목 순서 변경" })).toBeNull();
  });

  it("과목 목록을 받기 전에 앱 메뉴를 누르면 상태에 들어가지 않고 잠시 뒤 다시 누르라고 알린다", async () => {
    mockedListSubjects.mockReturnValue(new Promise(() => {}));
    window.history.replaceState(null, "", "/home?userId=7&nativeDateBar=1");
    __resetNativeDateBarForTests();
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    renderHome("/home?userId=7&nativeDateBar=1");
    await screen.findByRole("heading", { level: 1, name: dayTitleWithWeekday(TODAY) });

    act(() => emitNative('{"type":"home-menu-action","action":"edit-subjects","atMs":1}'));

    expect(screen.queryByRole("heading", { level: 1, name: "과목 편집" })).toBeNull();
    expect(showToast).toHaveBeenCalledWith("과목을 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요");
  });

  it("과목 완료 API가 없는 동안은 완료 버튼이 없다", async () => {
    renderHome();
    await screen.findByRole("button", { name: "국어 공부 시작" });

    expect(screen.queryByRole("button", { name: "완료 표시" })).toBeNull();
    expect(screen.queryByRole("button", { name: "완료 취소" })).toBeNull();
  });
});

describe("HomeTabPage — 과목 0개", () => {
  beforeEach(() => {
    mockedStats.mockResolvedValue(EMPTY_DAY);
    mockedListSubjects.mockResolvedValue([]);
  });

  it("과목을 만든 적 없으면 환영 화면이다", async () => {
    renderHome();

    expect(
      await screen.findByRole("heading", { name: "포커스메이커스에 오신 걸 환영해요" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ 과목 추가" })).not.toBeInTheDocument();
  });

  it("과목을 만든 적 있으면 과목 추가 버튼만 있는 빈 화면이다", async () => {
    markSubjectCreated(7);
    renderHome();

    expect(await screen.findByRole("button", { name: "+ 과목 추가" })).toBeInTheDocument();
    expect(screen.queryByText("포커스메이커스에 오신 걸 환영해요")).not.toBeInTheDocument();
  });

  it("지금 과목은 없어도 그날 지운 과목 기록이 있으면 환영 화면 대신 기록과 과목 추가를 보인다", async () => {
    mockedStats.mockResolvedValue({
      ...studiedDay(TODAY),
      subjects: [{ id: 1, name: "국어", colorIndex: 0, deleted: true }],
    });
    renderHome();

    const rows = within(await screen.findByRole("list", { name: "과목" })).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(["국어순공1시간 30분"]);
    expect(screen.getByRole("button", { name: "+ 과목 추가" })).toBeInTheDocument();
    expect(screen.queryByText("포커스메이커스에 오신 걸 환영해요")).not.toBeInTheDocument();
  });

  it("그날 지운 과목 기록만 있어도 만든 적 있음을 남겨 기록 없는 날로 옮기면 빈 화면이다", async () => {
    mockedStats.mockImplementation((dateKey: string) =>
      Promise.resolve(
        dateKey === TODAY
          ? {
              ...studiedDay(TODAY),
              subjects: [{ id: 1, name: "국어", colorIndex: 0, deleted: true }],
            }
          : EMPTY_DAY,
      ),
    );
    renderHome();

    await screen.findByRole("list", { name: "과목" });
    await waitFor(() => expect(hasCreatedSubject(7)).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: dayTitleWithWeekday(YESTERDAY) }));

    expect(await screen.findByRole("button", { name: "+ 과목 추가" })).toBeInTheDocument();
    expect(screen.queryByText("포커스메이커스에 오신 걸 환영해요")).not.toBeInTheDocument();
  });

  it("과목을 받으면 만든 적 있음을 남긴다", async () => {
    mockedListSubjects.mockResolvedValue(SUBJECTS);
    renderHome();

    await screen.findByRole("button", { name: "국어 공부 시작" });
    expect(hasCreatedSubject(7)).toBe(true);
  });

  it("시트에서 과목을 만들면 목록에 생기고 시트가 닫힌다", async () => {
    mockedCreateSubject.mockResolvedValue(subject(5, "물리"));
    renderHome();

    fireEvent.click(await screen.findByRole("button", { name: "과목 만들기" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "과목 이름" }), {
      target: { value: "물리" },
    });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    expect(await screen.findByRole("button", { name: "물리 공부 시작" })).toBeInTheDocument();
    expect(mockedCreateSubject).toHaveBeenCalledWith({ name: "물리" });
    expect(analytics.trackSubjectItemAdded).toHaveBeenCalledWith("subject", false, "home");
    expect(hasCreatedSubject(7)).toBe(true);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "과목 추가" })).not.toBeInTheDocument(),
    );
  });
});

describe("HomeTabPage — 헤더와 등록 상태", () => {
  it("userId가 없으면 데이터 조회 없이 단독 모드 안내만 보여 준다", () => {
    renderHome("/home");

    expect(screen.getByText(/기기 등록 전/)).toBeInTheDocument();
    expect(mockedStats).not.toHaveBeenCalled();
  });

  it("토큰 출처가 없는 문서에는 D-Day가 없다", async () => {
    renderHome();

    await screen.findByRole("button", { name: "순공 1시간 30분" });
    expect(screen.queryByRole("button", { name: "D-Day 설정" })).not.toBeInTheDocument();
  });

  it("토큰 문서면 헤더 오른쪽에 D-Day가 있다", async () => {
    tokenSourceMock.source = TOKEN_SOURCE;
    renderHome("/home");

    expect(await screen.findByRole("button", { name: "D-Day 설정" })).toBeInTheDocument();
  });

  it("토큰 출처가 있는데 첫 토큰이 아직이면 헤더와 본문이 로딩이다", async () => {
    tokenSourceMock.source = {
      getUserId: () => null,
      getAccessToken: () => null,
      hasSettled: () => false,
      subscribe: () => () => {},
    } as unknown as TokenSource;
    renderHome("/home");

    expect(await screen.findByTestId("home-header-pending")).toBeInTheDocument();
    expect(screen.queryByText(/기기 등록 전이에요/)).not.toBeInTheDocument();
  });
});

describe("HomeTabPage 팝업", () => {
  describe("복구 안내 모달", () => {
    it("서버가 대신 확정한 기록이 있으면 모달이 뜬다", async () => {
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });
      closeStaleSession.mockResolvedValue(RECOVERED);

      renderHome();
      emitAppLaunched();

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
      expect(screen.getByText("저장되지 않은 기록을 복구했어요")).toBeInTheDocument();
      expect(screen.getByText("1시간 24분")).toBeInTheDocument();
    });

    it("확인을 누르면 닫힌다", async () => {
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });
      closeStaleSession.mockResolvedValue(RECOVERED);

      renderHome();
      emitAppLaunched();
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "확인" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("공지가 떠 있는 동안은 기다렸다가 공지를 닫으면 뜬다", async () => {
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });
      getActiveNotices.mockImplementation(() => Promise.resolve([NOTICE]));
      closeStaleSession.mockResolvedValue(RECOVERED);

      renderHome();
      emitAppLaunched();
      expect(await screen.findByRole("dialog", { name: "점검 안내" })).toBeInTheDocument();
      await waitFor(() => expect(closeStaleSession).toHaveBeenCalled());
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByText("저장되지 않은 기록을 복구했어요")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "닫기" }));

      expect(await screen.findByText("저장되지 않은 기록을 복구했어요")).toBeInTheDocument();
    });

    it("공지가 떠 있는 동안 홈이 다시 보여도 복구 창이 겹치지 않는다", async () => {
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });
      getActiveNotices.mockImplementation(() => Promise.resolve([NOTICE]));
      closeStaleSession.mockResolvedValue(RECOVERED);

      renderHome();
      emitAppLaunched();
      await screen.findByRole("dialog", { name: "점검 안내" });
      await waitFor(() => expect(closeStaleSession).toHaveBeenCalled());

      document.dispatchEvent(new Event("visibilitychange"));
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByText("저장되지 않은 기록을 복구했어요")).toBeNull();
    });

    it("공지 조회가 끝나지 않아도 3초 뒤 복구 창이 뜨고, 늦게 온 공지는 그 위에 뜨지 않는다", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        mockedStats.mockResolvedValue(statsResponse);
        mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });
        let resolveNotices: (value: NoticeResponse[]) => void = () => {};
        getActiveNotices.mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveNotices = resolve;
            }),
        );
        closeStaleSession.mockResolvedValue(RECOVERED);

        renderHome();
        emitAppLaunched();
        await waitFor(() => expect(closeStaleSession).toHaveBeenCalled());
        await act(async () => {
          await Promise.resolve();
        });
        expect(screen.queryByText("저장되지 않은 기록을 복구했어요")).toBeNull();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000);
        });
        expect(screen.getByText("저장되지 않은 기록을 복구했어요")).toBeInTheDocument();

        await act(async () => resolveNotices([NOTICE]));
        expect(screen.queryByRole("dialog", { name: "점검 안내" })).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("3초 마감 뒤 늦게 온 공지는 버려서, 나중에 온 복구 창만 뜬다", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        mockedStats.mockResolvedValue(statsResponse);
        mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });
        let resolveNotices: (value: NoticeResponse[]) => void = () => {};
        getActiveNotices.mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveNotices = resolve;
            }),
        );
        closeStaleSession.mockResolvedValue(RECOVERED);

        renderHome();
        await waitFor(() => expect(getActiveNotices).toHaveBeenCalled());
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000);
        });
        await act(async () => resolveNotices([NOTICE]));
        expect(screen.queryByRole("dialog", { name: "점검 안내" })).toBeNull();

        emitAppLaunched();

        expect(await screen.findByText("저장되지 않은 기록을 복구했어요")).toBeInTheDocument();
        expect(screen.getAllByRole("dialog")).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("복구 결과가 공지를 닫은 뒤에 와도 뜬다", async () => {
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });
      getActiveNotices.mockImplementation(() => Promise.resolve([NOTICE]));
      closeStaleSession.mockResolvedValue(RECOVERED);

      renderHome();
      fireEvent.click(await screen.findByRole("button", { name: "닫기" }));
      emitAppLaunched();

      expect(await screen.findByText("저장되지 않은 기록을 복구했어요")).toBeInTheDocument();
    });
  });

  describe("홈 랭킹 팝업 순서", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      window.history.replaceState(null, "", "/");
      __resetRankingTabForTests();
    });

    it("공지가 뜬 실행에는 공지를 닫아도 랭킹 팝업을 띄우지 않는다", async () => {
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });
      getActiveNotices.mockImplementation(() => Promise.resolve([NOTICE]));
      rankingApi.getRankingRecordsUnseen.mockResolvedValue(FIXTURE_UNSEEN_ONE);

      renderHome();
      fireEvent.click(await screen.findByRole("button", { name: "닫기" }));
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(rankingApi.getRankingRecordsUnseen).not.toHaveBeenCalled();
    });

    it("복구 창이 뜬 실행에는 확인을 눌러도 랭킹 팝업을 띄우지 않는다", async () => {
      window.history.replaceState(null, "", "/home?ranking=1");
      __resetRankingTabForTests();
      // 셸처럼 준비 신호를 받은 자리에서 실행 신호로 답한다.
      const postMessage = vi.fn((raw: string) => {
        if ((JSON.parse(raw) as { type: string }).type === "home-ready") {
          emitAppLaunched();
        }
      });
      vi.stubGlobal("ReactNativeWebView", { postMessage });
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });
      closeStaleSession.mockResolvedValue(RECOVERED);
      rankingApi.getRankingRecordsUnseen.mockResolvedValue(FIXTURE_UNSEEN_ONE);

      renderHome();
      fireEvent.click(await screen.findByRole("button", { name: "확인" }));
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(rankingApi.getRankingRecordsUnseen).not.toHaveBeenCalled();
    });

    it("공지와 복구 창이 없으면 안 본 메달 모달을 띄운다", async () => {
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });
      rankingApi.getRankingRecordsUnseen.mockResolvedValue(FIXTURE_UNSEEN_ONE);

      renderHome();

      expect(await screen.findByRole("dialog", { name: "1위로 마감했어요" })).toBeInTheDocument();
      expect(rankingApi.postRankingRecordsSeen).toHaveBeenCalledWith([41]);
    });

    it("메달 모달이 뜬 뒤 복구 결과가 늦게 오면 모달을 두고, 모달을 닫은 뒤에 복구 창을 띄운다", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        window.history.replaceState(null, "", "/home?ranking=1");
        __resetRankingTabForTests();
        // 준비 신호에 바로 답하지 않는 셸이라 기다림이 끝나야 복구 판단이 끝난다.
        vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
        mockedStats.mockResolvedValue(statsResponse);
        mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });
        closeStaleSession.mockResolvedValue(RECOVERED);
        rankingApi.getRankingRecordsUnseen.mockResolvedValue(FIXTURE_UNSEEN_ONE);

        renderHome();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(LAUNCH_SIGNAL_WAIT_MS);
        });
        expect(await screen.findByRole("dialog", { name: "1위로 마감했어요" })).toBeInTheDocument();

        emitAppLaunched();
        await waitFor(() => expect(hasShownRecoveryThisLaunch()).toBe(true));
        await act(async () => {
          await Promise.resolve();
        });

        // 메달은 띄운 직후 본 것으로 보냈으므로 내리면 사용자가 못 본 메달이 본 것으로 넘어간다.
        expect(screen.getByRole("dialog", { name: "1위로 마감했어요" })).toBeInTheDocument();
        // 열린 모달 밖은 aria-hidden이 되어 역할 조회로는 겹침을 놓치므로 글자로 찾는다.
        expect(screen.queryByText(RECOVERY_TITLE)).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "닫기" }));

        expect(await screen.findByText(RECOVERY_TITLE)).toBeInTheDocument();
        expect(rankingApi.postRankingRecordsSeen).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("이번 실행 표시를 저장하지 못한 기기", () => {
    let restoreStorage: () => void = () => {};

    beforeEach(() => {
      // sessionStorage 쓰기만 막고 localStorage는 그대로 둔다.
      const original = Storage.prototype.setItem;
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
        this: Storage,
        key: string,
        value: string,
      ) {
        if (this === window.sessionStorage) {
          throw new Error("blocked");
        }
        original.call(this, key, value);
      });
      vi.spyOn(console, "warn").mockImplementation(() => {});
      restoreStorage = () => {
        spy.mockRestore();
        vi.mocked(console.warn).mockRestore();
      };
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });
      rankingApi.getRankingRecordsUnseen.mockResolvedValue(FIXTURE_UNSEEN_ONE);
    });

    afterEach(() => {
      restoreStorage();
      vi.unstubAllGlobals();
      Reflect.deleteProperty(document, "visibilityState");
      window.history.replaceState(null, "", "/");
      __resetRankingTabForTests();
    });

    it("공지를 띄운 문서에서는 공지를 닫아도 랭킹 팝업을 띄우지 않는다", async () => {
      getActiveNotices.mockImplementation(() => Promise.resolve([NOTICE]));

      renderHome();
      fireEvent.click(await screen.findByRole("button", { name: "닫기" }));
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(rankingApi.getRankingRecordsUnseen).not.toHaveBeenCalled();
    });

    it("복구 창이 뜬 문서에서는 랭킹 팝업이 앞서지 않고, 확인을 눌러도 띄우지 않는다", async () => {
      window.history.replaceState(null, "", "/home?ranking=1");
      __resetRankingTabForTests();
      const postMessage = vi.fn((raw: string) => {
        if ((JSON.parse(raw) as { type: string }).type === "home-ready") {
          emitAppLaunched();
        }
      });
      vi.stubGlobal("ReactNativeWebView", { postMessage });
      closeStaleSession.mockResolvedValue(RECOVERED);

      renderHome();
      expect(await screen.findByText(RECOVERY_TITLE)).toBeInTheDocument();
      expect(screen.queryByText("1위로 마감했어요")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "확인" }));
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(rankingApi.getRankingRecordsUnseen).not.toHaveBeenCalled();
    });

    it("랭킹 팝업을 띄운 문서에서는 다시 보여도 공지를 띄우지 않는다", async () => {
      getActiveNotices
        .mockImplementationOnce(() => Promise.resolve([]))
        .mockImplementation(() => Promise.resolve([NOTICE]));

      renderHome();
      fireEvent.click(await screen.findByRole("button", { name: "닫기" }));
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByText(NOTICE.title)).toBeNull();
    });
  });
});
