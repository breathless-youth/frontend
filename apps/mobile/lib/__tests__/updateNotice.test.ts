import {
  createMemoryUpdateNoticeStore,
  isUpdateNoticeEnabled,
  markUpdateNoticeSeen,
  resetUpdateNoticeStore,
  setUpdateNoticeStore,
  shouldShowUpdateNotice,
  type UpdateNoticeStore,
} from "../updateNotice";

/**
 * U1 노출 게이트 (`frontend/docs/screens/SCR-U1-update-sheet.md` Exposure Control).
 *
 * 이 화면의 성공 기준이 "기본 상태에서 절대 보이지 않는다"이므로, 테스트의 무게중심도
 * "언제 뜨는가"가 아니라 **"언제 뜨지 않는가"**에 있다.
 */

const mockExtra: Record<string, unknown> = {};

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

beforeEach(() => {
  for (const key of Object.keys(mockExtra)) {
    delete mockExtra[key];
  }
});

afterEach(() => {
  resetUpdateNoticeStore();
});

describe("isUpdateNoticeEnabled — 기본값은 꺼짐 (fail-closed)", () => {
  it("키가 아예 없으면 꺼짐", () => {
    expect(isUpdateNoticeEnabled()).toBe(false);
  });

  it("false면 꺼짐 — app.json에 커밋되는 값이다", () => {
    mockExtra.updateNoticeEnabled = false;

    expect(isUpdateNoticeEnabled()).toBe(false);
  });

  it("boolean true일 때만 켜진다", () => {
    mockExtra.updateNoticeEnabled = true;

    expect(isUpdateNoticeEnabled()).toBe(true);
  });

  it.each([["true"], [1], ["1"], [{}], [null]])(
    "boolean이 아닌 값(%p)은 꺼짐으로 본다 — 오타성 설정으로 시트가 뜨면 안 된다",
    (raw) => {
      mockExtra.updateNoticeEnabled = raw;

      expect(isUpdateNoticeEnabled()).toBe(false);
    },
  );
});

describe("shouldShowUpdateNotice — enabled && !seen 일 때만 true", () => {
  it("플래그가 꺼져 있으면 아직 안 봤어도 뜨지 않는다", async () => {
    setUpdateNoticeStore(createMemoryUpdateNoticeStore(false));

    await expect(shouldShowUpdateNotice()).resolves.toBe(false);
  });

  it("플래그가 꺼져 있으면 저장소를 조회하지도 않는다", async () => {
    const store: UpdateNoticeStore = {
      hasSeenUpdateNotice: jest.fn(() => Promise.resolve(false)),
      markUpdateNoticeSeen: jest.fn(() => Promise.resolve()),
    };
    setUpdateNoticeStore(store);

    await shouldShowUpdateNotice();

    expect(store.hasSeenUpdateNotice).not.toHaveBeenCalled();
  });

  it("플래그가 켜져 있고 아직 안 봤으면 뜬다", async () => {
    mockExtra.updateNoticeEnabled = true;
    setUpdateNoticeStore(createMemoryUpdateNoticeStore(false));

    await expect(shouldShowUpdateNotice()).resolves.toBe(true);
  });

  it("플래그가 켜져 있어도 이미 봤으면 뜨지 않는다 (1회 노출)", async () => {
    mockExtra.updateNoticeEnabled = true;
    setUpdateNoticeStore(createMemoryUpdateNoticeStore(true));

    await expect(shouldShowUpdateNotice()).resolves.toBe(false);
  });

  it("기록한 뒤에는 다시 뜨지 않는다", async () => {
    mockExtra.updateNoticeEnabled = true;
    setUpdateNoticeStore(createMemoryUpdateNoticeStore(false));

    await markUpdateNoticeSeen();

    await expect(shouldShowUpdateNotice()).resolves.toBe(false);
  });

  it("두 번 기록해도 결과가 같다 (멱등)", async () => {
    const store = createMemoryUpdateNoticeStore(false);
    setUpdateNoticeStore(store);

    await markUpdateNoticeSeen();
    await markUpdateNoticeSeen();

    await expect(store.hasSeenUpdateNotice()).resolves.toBe(true);
  });
});

describe("fail-safe", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("열람 여부 조회에 실패하면 노출하지 않는다 — 온보딩 가이드와 반대 방향(fail-closed)", async () => {
    mockExtra.updateNoticeEnabled = true;
    setUpdateNoticeStore({
      hasSeenUpdateNotice: () => Promise.reject(new Error("저장소 없음")),
      markUpdateNoticeSeen: () => Promise.resolve(),
    });

    await expect(shouldShowUpdateNotice()).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("기록에 실패해도 reject하지 않는다 — 시트는 이미 닫힌 뒤다", async () => {
    setUpdateNoticeStore({
      hasSeenUpdateNotice: () => Promise.resolve(false),
      markUpdateNoticeSeen: () => Promise.reject(new Error("쓰기 실패")),
    });

    await expect(markUpdateNoticeSeen()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});

describe("범위 경계 — 버전 체크 계약을 만들지 않는다", () => {
  it("게이트가 읽는 외부 설정은 노출 플래그 하나뿐이다", async () => {
    // 앱 버전·최소 요구 버전·강제 업데이트·스토어 URL을 넣어도 판정에 영향이 없다.
    // (`packages/types`·ai-wiki 어디에도 이런 계약이 없다 — 스펙 Data Contract)
    mockExtra.currentVersion = "1.0.0";
    mockExtra.minRequiredVersion = "9.9.9";
    mockExtra.forceUpdate = true;
    mockExtra.storeUrl = "https://example.test";
    setUpdateNoticeStore(createMemoryUpdateNoticeStore(false));

    await expect(shouldShowUpdateNotice()).resolves.toBe(false);
  });
});
