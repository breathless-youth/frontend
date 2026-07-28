import { render, screen } from "@testing-library/react-native";

import HomeScreen from "../app/(tabs)/index";
import { useHomeSummary } from "../components/home/useHomeSummary";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock("../components/home/useHomeSummary");
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

const mockedUseHomeSummary = useHomeSummary as jest.MockedFunction<typeof useHomeSummary>;

describe("HomeScreen 통계 상태", () => {
  it("success — 서버 통계를 렌더한다", () => {
    mockedUseHomeSummary.mockReturnValue({
      status: "success",
      summary: {
        focusSec: 3 * 3600 + 42 * 60,
        studySec: 5 * 3600 + 12 * 60,
        focusRate: 71.3,
        streakDays: 12,
        longestFocusSec: 52 * 60,
      },
    });
    render(<HomeScreen />);

    expect(screen.getByText("71% 집중")).toBeTruthy();
    expect(screen.getByText("총 공부 5시간 12분")).toBeTruthy();
    expect(screen.getByText("12일째")).toBeTruthy();
    expect(screen.getByText("52분")).toBeTruthy();
  });

  it("pending — 스켈레톤을 렌더한다", () => {
    mockedUseHomeSummary.mockReturnValue({ status: "pending" });
    render(<HomeScreen />);

    expect(screen.getAllByLabelText("불러오는 중").length).toBeGreaterThan(0);
    expect(screen.queryByText("% 집중", { exact: false })).toBeNull();
    expect(screen.getByText("집중 시작")).toBeTruthy();
  });

  it("error — 오류 문구와 다시 시도 버튼을 렌더한다", () => {
    const retry = jest.fn();
    mockedUseHomeSummary.mockReturnValue({ status: "error", retry });
    render(<HomeScreen />);

    expect(screen.getByText("기록을 불러오지 못했어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(screen.getByText("집중 시작")).toBeTruthy();
  });

  it("streakDays 0이면 시작 유도 문구를 보여준다", () => {
    mockedUseHomeSummary.mockReturnValue({
      status: "success",
      summary: { focusSec: 0, studySec: 0, focusRate: 0, streakDays: 0, longestFocusSec: 0 },
    });
    render(<HomeScreen />);

    expect(screen.getByText("오늘 10분 집중하면 연속 공부가 시작돼요")).toBeTruthy();
  });
});
