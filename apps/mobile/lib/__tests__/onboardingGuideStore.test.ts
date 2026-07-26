import {
  createMemoryOnboardingGuideStore,
  hasSeenOnboardingGuide,
  markOnboardingGuideSeen,
  type OnboardingGuideStore,
  resetOnboardingGuideStore,
  setOnboardingGuideStore,
} from "../onboardingGuideStore";

afterEach(() => {
  resetOnboardingGuideStore();
});

describe("OnboardingGuideStore", () => {
  it("저장값이 없으면 아직 안 본 것으로 본다", async () => {
    setOnboardingGuideStore(createMemoryOnboardingGuideStore());

    await expect(hasSeenOnboardingGuide()).resolves.toBe(false);
  });

  it("기록한 뒤에는 봤다고 답한다", async () => {
    setOnboardingGuideStore(createMemoryOnboardingGuideStore());

    await markOnboardingGuideSeen();

    await expect(hasSeenOnboardingGuide()).resolves.toBe(true);
  });

  it("두 번 기록해도 결과가 같다 (멱등)", async () => {
    const store = createMemoryOnboardingGuideStore();
    setOnboardingGuideStore(store);

    await markOnboardingGuideSeen();
    await markOnboardingGuideSeen();

    await expect(store.hasSeenGuide()).resolves.toBe(true);
  });

  describe("fail-safe", () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warn.mockRestore();
    });

    it("조회에 실패하면 '아직 안 봤다'로 떨어진다 — 최악이 안내를 한 번 더 보는 것", async () => {
      const failing: OnboardingGuideStore = {
        hasSeenGuide: () => Promise.reject(new Error("저장소 없음")),
        markGuideSeen: () => Promise.resolve(),
      };
      setOnboardingGuideStore(failing);

      await expect(hasSeenOnboardingGuide()).resolves.toBe(false);
      expect(warn).toHaveBeenCalled();
    });

    it("기록에 실패해도 reject하지 않는다 — 저장소 사정으로 세션 진행이 막히면 안 된다", async () => {
      const failing: OnboardingGuideStore = {
        hasSeenGuide: () => Promise.resolve(false),
        markGuideSeen: () => Promise.reject(new Error("쓰기 실패")),
      };
      setOnboardingGuideStore(failing);

      await expect(markOnboardingGuideSeen()).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    });
  });
});
