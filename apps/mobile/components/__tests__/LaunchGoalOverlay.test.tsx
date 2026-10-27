import { act, render, screen } from "@testing-library/react-native";

import {
  FADE_OUT_MS,
  LaunchGoalOverlay,
  MAX_VISIBLE_MS,
  MIN_VISIBLE_MS,
} from "../LaunchGoalOverlay";
import {
  __resetFirstScreenLoadedForTests,
  markFirstScreenLoaded,
} from "../../lib/firstScreenLoaded";
import {
  __resetNativeAnalyticsForTests,
  attachNativeAnalyticsSink,
  type NativeAnalyticsEvent,
} from "../../lib/nativeAnalytics";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));
// 진입점 객체에 spy를 걸면 컴포넌트가 이미 가져간 참조가 바뀌지 않아 모듈 자체를 대체한다.
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));
const mockUseReducedMotion = jest.fn(() => false);
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  ...jest.requireActual<object>("react-native-reanimated"),
  useReducedMotion: () => mockUseReducedMotion(),
}));

const { default: mockUseColorScheme } = jest.requireMock<{ default: jest.Mock }>(
  "react-native/Libraries/Utilities/useColorScheme",
);

const GOAL = { goal: "하루 6시간 공부하기", nickname: "포메" };

beforeEach(() => {
  mockUseColorScheme.mockReturnValue("light");
  mockUseReducedMotion.mockReturnValue(false);
  jest.useFakeTimers();
  __resetFirstScreenLoadedForTests();
  __resetNativeAnalyticsForTests();
});

afterEach(() => {
  jest.useRealTimers();
});

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

describe("LaunchGoalOverlay", () => {
  it("목표 문구, 닉네임, 로딩 문구를 보여 준다", () => {
    render(<LaunchGoalOverlay launchGoal={GOAL} onDone={jest.fn()} />);

    expect(screen.getByText("하루 6시간 공부하기")).toBeTruthy();
    expect(screen.getByText("포메")).toBeTruthy();
    expect(screen.getByText("오늘 할 공부를 정리하고 있어요")).toBeTruthy();
    expect(screen.getByTestId("launch-goal-divider")).toBeTruthy();
  });

  it("닉네임이 없으면 닉네임과 구분선을 그리지 않는다", () => {
    render(
      <LaunchGoalOverlay launchGoal={{ goal: "하루 6시간", nickname: null }} onDone={jest.fn()} />,
    );

    expect(screen.queryByTestId("launch-goal-divider")).toBeNull();
    expect(screen.queryByText("포메")).toBeNull();
  });

  it("스크린 리더가 목표 문구와 닉네임을 함께 읽는다", () => {
    render(<LaunchGoalOverlay launchGoal={GOAL} onDone={jest.fn()} />);

    const root = screen.getByTestId("launch-goal-overlay");
    expect(root.props.accessible).toBe(true);
    expect(root.props.accessibilityLabel).toBe("하루 6시간 공부하기, 포메");
  });

  it("닉네임이 없으면 스크린 리더가 목표 문구만 읽는다", () => {
    render(
      <LaunchGoalOverlay launchGoal={{ goal: "하루 6시간", nickname: null }} onDone={jest.fn()} />,
    );

    expect(screen.getByTestId("launch-goal-overlay").props.accessibilityLabel).toBe("하루 6시간");
  });

  it.each([
    ["light", "#f8fafd"],
    ["dark", "#0d1118"],
  ])("%s 스킴이면 스플래시와 같은 배경 %s를 칠한다", (scheme, color) => {
    mockUseColorScheme.mockReturnValue(scheme);
    render(<LaunchGoalOverlay launchGoal={GOAL} onDone={jest.fn()} />);

    expect(screen.getByTestId("launch-goal-overlay")).toHaveStyle({ backgroundColor: color });
  });

  it("모션 줄이기면 페이드아웃 없이 최소 노출 시간에 바로 끝난다", () => {
    mockUseReducedMotion.mockReturnValue(true);
    markFirstScreenLoaded();
    const onDone = jest.fn();
    render(<LaunchGoalOverlay launchGoal={GOAL} onDone={onDone} />);

    advance(MIN_VISIBLE_MS - 1);
    expect(onDone).not.toHaveBeenCalled();

    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("최대 노출 시간은 최소 노출 시간보다 길다", () => {
    expect(MAX_VISIBLE_MS).toBeGreaterThan(MIN_VISIBLE_MS);
  });

  it("첫 화면이 이미 로드됐어도 최소 노출 시간은 보여 준다", () => {
    markFirstScreenLoaded();
    const onDone = jest.fn();
    render(<LaunchGoalOverlay launchGoal={GOAL} onDone={onDone} />);

    advance(MIN_VISIBLE_MS - 1);
    expect(onDone).not.toHaveBeenCalled();

    advance(1 + FADE_OUT_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("첫 화면 로드가 오지 않으면 최대 노출 시간에 걷는다", () => {
    const onDone = jest.fn();
    render(<LaunchGoalOverlay launchGoal={GOAL} onDone={onDone} />);

    advance(MAX_VISIBLE_MS - 1);
    expect(onDone).not.toHaveBeenCalled();

    advance(1 + FADE_OUT_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("최소 노출 시간 뒤에 첫 화면이 로드되면 그때 걷는다", () => {
    const onDone = jest.fn();
    render(<LaunchGoalOverlay launchGoal={GOAL} onDone={onDone} />);

    advance(MIN_VISIBLE_MS + 500);
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      markFirstScreenLoaded();
    });

    advance(FADE_OUT_MS - 1);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);

    advance(MAX_VISIBLE_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("언마운트하면 타이머와 구독을 정리한다", () => {
    const onDone = jest.fn();
    const { unmount } = render(<LaunchGoalOverlay launchGoal={GOAL} onDone={onDone} />);

    advance(MIN_VISIBLE_MS / 2);
    unmount();
    markFirstScreenLoaded();
    advance(MAX_VISIBLE_MS * 2);

    expect(onDone).not.toHaveBeenCalled();
  });

  // 저장소 jest 설정에는 Reanimated 테스트 타이머가 없어 크로스페이드 도착값은 보지 않고 출발 상태만 본다.
  it("로고는 스플래시처럼 불투명하게 시작한다", () => {
    render(<LaunchGoalOverlay launchGoal={GOAL} onDone={jest.fn()} />);

    expect(screen.getByTestId("launch-goal-logo")).toHaveStyle({ opacity: 1 });
  });

  it("모션 줄이기면 로고 없이 문구를 바로 보여 준다", () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<LaunchGoalOverlay launchGoal={GOAL} onDone={jest.fn()} />);

    expect(screen.queryByTestId("launch-goal-logo")).toBeNull();
    expect(screen.getByTestId("launch-goal-text")).toHaveStyle({ opacity: 1 });
  });

  it("따옴표는 그리되 스크린 리더에서는 숨긴다", () => {
    render(<LaunchGoalOverlay launchGoal={GOAL} onDone={jest.fn()} />);

    expect(screen.queryByText("“")).toBeNull();
    const quote = screen.getByText("“", { includeHiddenElements: true });
    expect(quote.props.importantForAccessibility).toBe("no");
    expect(quote.props.accessibilityElementsHidden).toBe(true);
    expect(screen.getByTestId("launch-goal-overlay").props.accessibilityLabel).toBe(
      "하루 6시간 공부하기, 포메",
    );
  });
});

describe("LaunchGoalOverlay 노출 계측", () => {
  function collectEvents() {
    const events: NativeAnalyticsEvent[] = [];
    attachNativeAnalyticsSink((event) => events.push(event));
    return events;
  }

  it("첫 화면 로드로 걷히면 loaded와 보인 시간을 한 번 남긴다", () => {
    const events = collectEvents();
    render(<LaunchGoalOverlay launchGoal={GOAL} onDone={jest.fn()} />);

    advance(MIN_VISIBLE_MS + 500);
    act(() => {
      markFirstScreenLoaded();
    });
    advance(MAX_VISIBLE_MS);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: "launch_goal_overlay_viewed",
      properties: { visible_ms: MIN_VISIBLE_MS + 500, closed_by: "loaded", reduce_motion: false },
    });
  });

  it("로드 신호 없이 상한으로 걷히면 max를 남긴다", () => {
    const events = collectEvents();
    render(<LaunchGoalOverlay launchGoal={GOAL} onDone={jest.fn()} />);

    advance(MAX_VISIBLE_MS + FADE_OUT_MS);

    expect(events).toHaveLength(1);
    expect(events[0]?.properties).toEqual({
      visible_ms: MAX_VISIBLE_MS,
      closed_by: "max",
      reduce_motion: false,
    });
  });

  it("모션 줄이기 여부를 남기고 목표 문구와 닉네임은 싣지 않는다", () => {
    mockUseReducedMotion.mockReturnValue(true);
    markFirstScreenLoaded();
    const events = collectEvents();
    render(<LaunchGoalOverlay launchGoal={GOAL} onDone={jest.fn()} />);

    advance(MIN_VISIBLE_MS);

    expect(events[0]?.properties).toEqual({
      visible_ms: MIN_VISIBLE_MS,
      closed_by: "loaded",
      reduce_motion: true,
    });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(GOAL.goal);
    expect(serialized).not.toContain(GOAL.nickname);
  });

  it("걷히기 전에 언마운트되면 남기지 않는다", () => {
    const events = collectEvents();
    const { unmount } = render(<LaunchGoalOverlay launchGoal={GOAL} onDone={jest.fn()} />);

    advance(MIN_VISIBLE_MS / 2);
    unmount();
    advance(MAX_VISIBLE_MS * 2);

    expect(events).toHaveLength(0);
  });
});
