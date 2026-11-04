import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loaded = vi.hoisted(() => ({
  result: 0,
  profile: 0,
  terms: 0,
  privacy: 0,
  licenses: 0,
  contact: 0,
  groupHome: 0,
  groupMembers: 0,
  groupApplications: 0,
  reportApplication: 0,
  publicGroup: 0,
  apply: 0,
  groupForm: 0,
  blockList: 0,
}));

vi.mock("../ResultPage", () => {
  loaded.result += 1;
  return { ResultPage: () => null };
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
vi.mock("../GroupHomePage", () => {
  loaded.groupHome += 1;
  return { GroupHomePage: () => null };
});
vi.mock("../GroupMembersPage", () => {
  loaded.groupMembers += 1;
  return { GroupMembersPage: () => null };
});
vi.mock("../GroupApplicationsPage", () => {
  loaded.groupApplications += 1;
  return { GroupApplicationsPage: () => null };
});
vi.mock("../ReportApplicationPage", () => {
  loaded.reportApplication += 1;
  return { ReportApplicationPage: () => null };
});
vi.mock("../PublicGroupPage", () => {
  loaded.publicGroup += 1;
  return { PublicGroupPage: () => null };
});
vi.mock("../ApplyPage", () => {
  loaded.apply += 1;
  return { ApplyPage: () => null };
});
vi.mock("../GroupFormPage", () => {
  loaded.groupForm += 1;
  return { GroupFormPage: () => null };
});
vi.mock("../BlockListPage", () => {
  loaded.blockList += 1;
  return { BlockListPage: () => null };
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

  it("설정 하위 화면 청크를 유휴 시간에 모두 받는다", async () => {
    const { prefetchSettingsSubPages } = await import("../lazyRoutes");

    prefetchSettingsSubPages();
    expect(loaded.profile).toBe(0);

    await runIdle();
    expect(loaded).toMatchObject({ profile: 1, terms: 1, privacy: 1, licenses: 1, contact: 1 });
  });

  it("그룹 하위 화면 청크를 유휴 시간에 받는다", async () => {
    const { prefetchGroupPages } = await import("../lazyRoutes");

    prefetchGroupPages();
    expect(loaded.groupHome).toBe(0);

    await runIdle();
    expect(loaded).toMatchObject({
      groupHome: 1,
      groupMembers: 1,
      groupApplications: 1,
      reportApplication: 1,
      publicGroup: 1,
      apply: 1,
      groupForm: 1,
    });
    expect(loaded.blockList).toBe(0);
  });

  it("설정에서 여는 차단 목록 청크는 따로 유휴 시간에 받는다", async () => {
    const { prefetchBlockListPage } = await import("../lazyRoutes");

    prefetchBlockListPage();
    expect(loaded.blockList).toBe(0);

    await runIdle();
    expect(loaded.blockList).toBe(1);
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
