import {
  mockCameraPermissionAdapter,
  resetMockCameraPermissionState,
  setCameraPermissionAdapter,
  setMockCameraPermissionState,
} from "../cameraPermission";
import {
  continueAfterOnboardingGuide,
  exitOnboardingGuide,
  runFocusStartFlow,
} from "../focusStartFlow";
import {
  createMemoryOnboardingGuideStore,
  resetOnboardingGuideStore,
  setOnboardingGuideStore,
} from "../onboardingGuideStore";

function makeNavigator() {
  return {
    openOnboardingGuide: jest.fn(),
    showPermissionDeniedGuide: jest.fn(),
    startSession: jest.fn(),
  };
}

beforeEach(() => {
  setCameraPermissionAdapter(mockCameraPermissionAdapter);
  resetMockCameraPermissionState();
  setOnboardingGuideStore(createMemoryOnboardingGuideStore());
});

afterEach(() => {
  resetOnboardingGuideStore();
});

describe("runFocusStartFlow — S1 '집중 시작' 탭", () => {
  it("최초 1회는 가이드를 먼저 띄우고 권한을 요청하지 않는다", async () => {
    const nav = makeNavigator();

    await runFocusStartFlow(nav);

    expect(nav.openOnboardingGuide).toHaveBeenCalledWith("focus-start");
    expect(nav.startSession).not.toHaveBeenCalled();
    expect(nav.showPermissionDeniedGuide).not.toHaveBeenCalled();
  });

  it("가이드를 이미 봤으면 가이드를 건너뛰고 곧장 권한 게이트로 간다", async () => {
    setOnboardingGuideStore(createMemoryOnboardingGuideStore(true));
    setMockCameraPermissionState({ status: "granted" });
    const nav = makeNavigator();

    await runFocusStartFlow(nav);

    expect(nav.openOnboardingGuide).not.toHaveBeenCalled();
    expect(nav.startSession).toHaveBeenCalled();
  });

  it("가이드를 이미 봤고 권한이 거부돼 있으면 S2-3으로 보낸다", async () => {
    setOnboardingGuideStore(createMemoryOnboardingGuideStore(true));
    setMockCameraPermissionState({ status: "denied" });
    const nav = makeNavigator();

    await runFocusStartFlow(nav);

    expect(nav.showPermissionDeniedGuide).toHaveBeenCalled();
    expect(nav.startSession).not.toHaveBeenCalled();
  });
});

describe("continueAfterOnboardingGuide — 가이드 종료 후", () => {
  it("'집중 시작' 진입이면 권한 요청으로 이어진다 (2026-07-26 확정 플로우)", async () => {
    setMockCameraPermissionState({ status: "undetermined", dialogOutcome: "granted" });
    const nav = makeNavigator();

    await continueAfterOnboardingGuide(nav, "focus-start");

    expect(nav.startSession).toHaveBeenCalled();
  });

  it("완료든 건너뛰기든 '봤다'로 기록해 다음 '집중 시작'에서 다시 뜨지 않는다", async () => {
    const store = createMemoryOnboardingGuideStore();
    setOnboardingGuideStore(store);
    setMockCameraPermissionState({ status: "granted" });

    await continueAfterOnboardingGuide(makeNavigator(), "focus-start");

    await expect(store.hasSeenGuide()).resolves.toBe(true);
    const nav = makeNavigator();
    await runFocusStartFlow(nav);
    expect(nav.openOnboardingGuide).not.toHaveBeenCalled();
  });

  it("권한이 거부돼 있어도 세션을 시작하지 않고 S2-3으로 보낸다", async () => {
    setMockCameraPermissionState({ status: "denied" });
    const nav = makeNavigator();

    await continueAfterOnboardingGuide(nav, "focus-start");

    expect(nav.showPermissionDeniedGuide).toHaveBeenCalled();
    expect(nav.startSession).not.toHaveBeenCalled();
  });

  it("다시 보기(홈 카드·설정) 진입에서는 권한을 요청하지 않는다 — 재진입 CTA 동작은 미정", async () => {
    setMockCameraPermissionState({ status: "granted" });

    for (const entry of ["home-card", "settings"] as const) {
      const nav = makeNavigator();
      await continueAfterOnboardingGuide(nav, entry);

      expect(nav.startSession).not.toHaveBeenCalled();
      expect(nav.showPermissionDeniedGuide).not.toHaveBeenCalled();
    }
  });
});

describe("exitOnboardingGuide — 우상단 X 나가기(BY-151)", () => {
  it("봤음을 저장하고 권한 게이트·세션 시작은 호출하지 않는다", async () => {
    const store = createMemoryOnboardingGuideStore();
    setOnboardingGuideStore(store);
    // 이 파일에는 `runCameraPermissionGate` 자체를 모킹하는 기존 관례가 없다 — 대신 파일이
    // 이미 쓰는 어댑터 주입 지점(`setCameraPermissionAdapter`)에 스파이를 꽂아 "권한 게이트가
    // 조회조차 하지 않았다"를 직접 검증한다.
    const getStatus = jest.fn(mockCameraPermissionAdapter.getStatus);
    const request = jest.fn(mockCameraPermissionAdapter.request);
    setCameraPermissionAdapter({ getStatus, request });

    await exitOnboardingGuide();

    await expect(store.hasSeenGuide()).resolves.toBe(true);
    expect(getStatus).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});
