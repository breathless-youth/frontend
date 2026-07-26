import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import OnboardingGuideScreen from "../app/onboarding-guide";
import {
  mockCameraPermissionAdapter,
  resetMockCameraPermissionState,
  setCameraPermissionAdapter,
  setMockCameraPermissionState,
} from "../lib/cameraPermission";
import {
  createMemoryOnboardingGuideStore,
  type OnboardingGuideStore,
  resetOnboardingGuideStore,
  setOnboardingGuideStore,
} from "../lib/onboardingGuideStore";

/**
 * 화면 테스트는 `app/` 밖에 둔다 — `expo-router`의 라우트 컨텍스트 정규식이 `__tests__`·
 * `.test.tsx`를 걸러내지 않아 `app/` 아래에 두면 테스트 파일이 라우트로 등록된다
 * (`__tests__/permission-denied.test.tsx`와 같은 이유).
 */

let mockEntryParam = "focus-start";

jest.mock("expo-router", () => ({
  router: { canGoBack: jest.fn(() => true), back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ entry: mockEntryParam }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

let store: OnboardingGuideStore;

beforeEach(() => {
  mockEntryParam = "focus-start";
  store = createMemoryOnboardingGuideStore();
  setOnboardingGuideStore(store);
  setCameraPermissionAdapter(mockCameraPermissionAdapter);
  resetMockCameraPermissionState();
  jest.clearAllMocks();
});

afterEach(() => {
  resetOnboardingGuideStore();
});

/** 현재 스텝의 CTA를 눌러 다음으로 넘긴다. */
function pressNext() {
  fireEvent.press(screen.getByRole("button", { name: "다음" }));
}

describe("G1~G5 온보딩 가이드 — 5스텝 한 플로우", () => {
  it("G1 확정 카피와 내비게이션을 노출한다", () => {
    render(<OnboardingGuideScreen />);

    expect(screen.getByText("순공시간이 여기에 쌓여요")).toBeTruthy();
    expect(
      screen.getByText("집중하는 동안 타이머가 저절로 올라가요. 눌러야 할 건 없어요."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "이전" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "다음" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "건너뛰기" })).toBeTruthy();
  });

  it("'다음'으로 G1→G5까지 이동하고 마지막 CTA만 '집중 시작하기'가 된다", () => {
    render(<OnboardingGuideScreen />);

    pressNext();
    expect(screen.getByText("집중이 아니면, 잠시 멈춰요")).toBeTruthy();
    pressNext();
    expect(screen.getByText("탭 한 번이면, 타이머만 크게")).toBeTruthy();
    pressNext();
    expect(screen.getByText("잠깐 쉴 땐 일시정지")).toBeTruthy();
    pressNext();

    expect(screen.getByText("영상은 기기 밖으로 나가지 않아요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "집중 시작하기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "다음" })).toBeNull();
  });

  it("G5에는 건너뛰기 대신 재진입 안내 문구가 있다", () => {
    render(<OnboardingGuideScreen />);
    for (let i = 0; i < 4; i += 1) {
      pressNext();
    }

    expect(screen.queryByRole("button", { name: "건너뛰기" })).toBeNull();
    expect(
      screen.getByText("이 안내는 설정 > 측정 기준 안내에서 언제든 다시 볼 수 있어요"),
    ).toBeTruthy();
  });

  it("G2는 비집중 상태 필과 보조 문구를 보여준다 (순공만 멈추는 시연)", () => {
    render(<OnboardingGuideScreen />);
    pressNext();

    // 강조 대상(상태 필)은 스크린 리더에도 노출된다.
    expect(screen.getByText("자리를 비운 것 같아요")).toBeTruthy();
    expect(screen.getByText("돌아오면 자동으로 다시 측정돼요")).toBeTruthy();
    // 타이머는 이 스텝의 강조 대상이 아니라 dim 아래 장식이다 — 스크린 리더에서 제외되므로
    // `includeHiddenElements`로만 조회된다(그 자체가 접근성 요건의 검증이다).
    // Figma 시드값: 순공 00:00:12 < 총 00:00:22 — 이 관계가 G2의 교육 목적 그 자체다.
    expect(screen.getByText("00:00:12", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("총 00:00:22", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText("00:00:12")).toBeNull();
  });

  it("강조 대상만 스크린 리더에 노출한다 — G1은 타이머", () => {
    render(<OnboardingGuideScreen />);

    expect(screen.getByLabelText("순공시간 00:00:19, 총 00:00:22")).toBeTruthy();
    // 상태 필은 G1의 강조 대상이 아니다 — 배경 장식으로 취급해 숨긴다.
    expect(screen.queryByText("집중 측정 중")).toBeNull();
    expect(screen.getByText("집중 측정 중", { includeHiddenElements: true })).toBeTruthy();
  });

  it("'이전'으로 되돌아간다", () => {
    render(<OnboardingGuideScreen />);
    pressNext();

    fireEvent.press(screen.getByRole("button", { name: "이전" }));

    expect(screen.getByText("순공시간이 여기에 쌓여요")).toBeTruthy();
  });

  it("G1의 '이전'은 눌려도 아무 일이 없고 그 사실이 접근성 상태로 드러난다 (처리 미정)", () => {
    render(<OnboardingGuideScreen />);

    const prev = screen.getByRole("button", { name: "이전" });
    expect(prev.props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.press(prev);

    expect(screen.getByText("순공시간이 여기에 쌓여요")).toBeTruthy();
  });

  it("화면 탭으로도 다음 스텝으로 넘어간다 (하단 힌트가 약속한 동작)", () => {
    render(<OnboardingGuideScreen />);

    fireEvent.press(
      screen.getByTestId("onboarding-guide-tap-layer", { includeHiddenElements: true }),
    );

    expect(screen.getByText("집중이 아니면, 잠시 멈춰요")).toBeTruthy();
  });

  it("진행 상태를 색·크기 말고 텍스트로도 알린다", () => {
    render(<OnboardingGuideScreen />);

    expect(screen.getByLabelText("5단계 중 1단계")).toBeTruthy();
    pressNext();
    expect(screen.getByLabelText("5단계 중 2단계")).toBeTruthy();
  });
});

describe("플로우 종료 — 완료·건너뛰기 둘 다 세션으로 이어진다", () => {
  it("G5 CTA로 완료하면 가이드를 닫고 세션 시작 경로로 간다", async () => {
    setMockCameraPermissionState({ status: "granted" });
    render(<OnboardingGuideScreen />);
    for (let i = 0; i < 4; i += 1) {
      pressNext();
    }

    fireEvent.press(screen.getByRole("button", { name: "집중 시작하기" }));

    expect(router.back).toHaveBeenCalled();
    await waitFor(async () => {
      await expect(store.hasSeenGuide()).resolves.toBe(true);
    });
    // 세션 라우트(S3-1)가 아직 없으므로 존재하지 않는 경로로 이동을 시도하지 않는다.
    expect(router.push).not.toHaveBeenCalled();
  });

  it("건너뛰어도 '봤다'로 기록하고 같은 다음 단계로 이어진다", async () => {
    setMockCameraPermissionState({ status: "granted" });
    render(<OnboardingGuideScreen />);

    fireEvent.press(screen.getByRole("button", { name: "건너뛰기" }));

    expect(router.back).toHaveBeenCalled();
    await waitFor(async () => {
      await expect(store.hasSeenGuide()).resolves.toBe(true);
    });
  });

  it("권한이 거부돼 있으면 세션 대신 S2-3 안내로 보낸다", async () => {
    setMockCameraPermissionState({ status: "denied" });
    render(<OnboardingGuideScreen />);

    fireEvent.press(screen.getByRole("button", { name: "건너뛰기" }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/permission-denied");
    });
  });

  it("다시 보기(홈 카드) 진입에서는 권한 요청으로 이어지지 않는다 — 재진입 CTA 동작 미정", async () => {
    mockEntryParam = "home-card";
    setMockCameraPermissionState({ status: "denied" });
    render(<OnboardingGuideScreen />);
    for (let i = 0; i < 4; i += 1) {
      pressNext();
    }

    fireEvent.press(screen.getByRole("button", { name: "집중 시작하기" }));

    await waitFor(() => {
      expect(router.back).toHaveBeenCalled();
    });
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("범위 경계", () => {
  it("카메라를 켜지 않는다 — 가이드는 권한 요청보다 먼저 실행된다", () => {
    render(<OnboardingGuideScreen />);

    // 배경은 카메라 피드가 아니라 목업이라는 것이 화면에도 드러난다(장식이라 a11y에서는 제외).
    expect(
      screen.getByText("[ 전 면 카 메 라 프 리 뷰 ]", { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it("싱글룸 프라이버시 문구만 쓴다", () => {
    render(<OnboardingGuideScreen />);
    for (let i = 0; i < 4; i += 1) {
      pressNext();
    }

    expect(
      screen.getByText(
        "측정은 기기 안에서만 이루어지고, 영상은 저장하지 않아요. 남는 건 오직 공부 시간 기록뿐이에요.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/AI 분석용 원본 프레임/)).toBeNull();
  });
});
