import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loaded = vi.hoisted(() => ({
  result: 0,
  guide: 0,
  profile: 0,
  terms: 0,
  privacy: 0,
  licenses: 0,
  contact: 0,
}));

vi.mock("../ResultPage", () => {
  loaded.result += 1;
  return { ResultPage: () => null };
});
vi.mock("../OnboardingGuidePage", () => {
  loaded.guide += 1;
  return { OnboardingGuidePage: () => null };
});
vi.mock("../ProfilePage", () => {
  loaded.profile += 1;
  return { ProfilePage: () => null };
});
vi.mock("../TermsPage", () => {
  loaded.terms += 1;
  return { TermsPage: () => null };
});
vi.mock("../PrivacyPage", () => {
  loaded.privacy += 1;
  return { PrivacyPage: () => null };
});
vi.mock("../LicensesPage", () => {
  loaded.licenses += 1;
  return { LicensesPage: () => null };
});
vi.mock("../ContactPage", () => {
  loaded.contact += 1;
  return { ContactPage: () => null };
});

let idleCallbacks: IdleRequestCallback[] = [];

beforeEach(() => {
  vi.resetModules();
  for (const key of Object.keys(loaded) as Array<keyof typeof loaded>) {
    loaded[key] = 0;
  }
  idleCallbacks = [];
  vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
    idleCallbacks.push(callback);
    return idleCallbacks.length;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function runIdle() {
  for (const callback of idleCallbacks.splice(0)) {
    callback({ didTimeout: false, timeRemaining: () => 50 });
  }
  await vi.dynamicImportSettled();
}

describe("lazyRoutes 미리 받기", () => {
  it("결과 청크를 유휴 시간에 받는다", async () => {
    const { prefetchResultPage } = await import("../lazyRoutes");

    prefetchResultPage();
    await runIdle();
    expect(loaded.result).toBe(1);
  });

  it("가이드 청크를 유휴 시간에 받는다", async () => {
    const { prefetchOnboardingGuidePage } = await import("../lazyRoutes");

    prefetchOnboardingGuidePage();
    expect(loaded.guide).toBe(0);

    await runIdle();
    expect(loaded.guide).toBe(1);
  });

  it("설정 하위 화면 청크를 유휴 시간에 모두 받는다", async () => {
    const { prefetchSettingsSubPages } = await import("../lazyRoutes");

    prefetchSettingsSubPages();
    expect(loaded.profile).toBe(0);

    await runIdle();
    expect(loaded).toMatchObject({ profile: 1, terms: 1, privacy: 1, licenses: 1, contact: 1 });
  });

  it("청크를 받지 못해도 예외가 새지 않는다", async () => {
    vi.doMock("../ResultPage", () => {
      throw new Error("chunk load failed");
    });
    const { prefetchResultPage } = await import("../lazyRoutes");
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    prefetchResultPage();
    await runIdle();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(unhandled).not.toHaveBeenCalled();
    process.off("unhandledRejection", unhandled);
    vi.doUnmock("../ResultPage");
  });
});
