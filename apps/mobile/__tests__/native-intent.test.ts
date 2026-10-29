import { redirectSystemPath } from "../app/+native-intent";
import { setSessionInviteHandler } from "../lib/sessionInvite";
import {
  __resetInitialActiveRouteForTests,
  subscribeSettingsReveal,
  takeInitialActiveRoute,
} from "../lib/settingsReveal";

jest.mock("expo-router", () => ({ router: { navigate: jest.fn() } }));

const { router: mockRouter } = jest.requireMock<{ router: { navigate: jest.Mock } }>("expo-router");

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { appSchemes: ["focusmakers"], deepLinkHosts: ["web.focusmakers.app"] },
    },
  },
}));

let release: (() => void) | null = null;

afterEach(() => {
  release?.();
  release = null;
  __resetInitialActiveRouteForTests();
  jest.restoreAllMocks();
});

describe("redirectSystemPath", () => {
  it("세션 화면이 없으면 받은 경로를 그대로 돌려준다", () => {
    const path = "https://web.focusmakers.app/social/join?code=4680";

    expect(redirectSystemPath({ path, initial: false })).toBe(path);
  });

  it.each([
    "https://web.focusmakers.app/social/join?code=4680",
    "focusmakers://social/join?code=4680",
  ])("세션 화면이 열려 있으면 %s의 이동을 멈추고 코드를 세션 화면에 넘긴다", (path) => {
    const handler = jest.fn();
    release = setSessionInviteHandler(handler);

    expect(redirectSystemPath({ path, initial: false })).toBeNull();
    expect(handler).toHaveBeenCalledWith("4680");
  });

  it("콜드 스타트 링크는 세션 화면 여부와 상관없이 그대로 보낸다", () => {
    const handler = jest.fn();
    release = setSessionInviteHandler(handler);
    const path = "focusmakers://social/join?code=4680";

    expect(redirectSystemPath({ path, initial: true })).toBe(path);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    "https://web.focusmakers.app/records",
    "https://other.example.com/social/join?code=4680",
    "focusmakers://social/join",
  ])("초대가 아닌 링크 %s는 세션 화면이 있어도 그대로 보낸다", (path) => {
    const handler = jest.fn();
    release = setSessionInviteHandler(handler);

    expect(redirectSystemPath({ path, initial: false })).toBe(path);
    expect(handler).not.toHaveBeenCalled();
  });

  it("세션 화면 핸들러가 예외를 던져도 앱을 죽이지 않고 받은 경로를 돌려준다", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    release = setSessionInviteHandler(() => {
      throw new Error("boom");
    });
    const path = "focusmakers://social/join?code=4680";

    expect(redirectSystemPath({ path, initial: false })).toBe(path);
    warn.mockRestore();
  });

  it("설정 링크는 탭 레이아웃이 설정 칸을 드러낸 뒤에 연다", async () => {
    mockRouter.navigate.mockClear();
    let reveal: (() => void) | undefined;
    const unsubscribe = subscribeSettingsReveal((then) => {
      reveal = then;
    });

    expect(redirectSystemPath({ path: "focusmakers://settings", initial: false })).toBeNull();
    expect(mockRouter.navigate).not.toHaveBeenCalled();

    reveal?.();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(mockRouter.navigate).toHaveBeenCalledWith("/settings");
    unsubscribe();
  });

  it("콜드 스타트 설정 링크는 그대로 보내고 탭 레이아웃이 설정에서 시작하도록 남긴다", () => {
    const path = "focusmakers://settings";
    expect(redirectSystemPath({ path, initial: true })).toBe(path);
    expect(takeInitialActiveRoute()).toBe("settings");
    // 한 번 읽으면 비워서 레이아웃이 다시 마운트돼도 홈에서 시작한다.
    expect(takeInitialActiveRoute()).toBe("index");
  });

  it.each([
    ["focusmakers://profile", "%252Fprofile"],
    ["https://web.focusmakers.app/timelapse-settings", "%252Ftimelapse-settings"],
    ["https://web.focusmakers.app/settings?from=push", "%252Fsettings%253Ffrom%253Dpush"],
  ])(
    "설정 탭이 여는 콜드 스타트 링크 %s는 설정 탭 경로로 바꾸고 설정에서 시작하도록 남긴다",
    (path, encoded) => {
      jest.spyOn(Date, "now").mockReturnValue(1);
      expect(redirectSystemPath({ path, initial: true })).toBe(`/settings?path=${encoded}&at=1`);
      expect(takeInitialActiveRoute()).toBe("settings");
    },
  );

  it.each([
    ["focusmakers://profile", "/profile"],
    ["https://web.focusmakers.app/timelapse-settings", "/timelapse-settings"],
  ])("설정 탭이 여는 링크 %s도 설정 칸을 드러낸 뒤에 연다", async (path, webPath) => {
    jest.spyOn(Date, "now").mockReturnValue(1);
    mockRouter.navigate.mockClear();
    let reveal: (() => void) | undefined;
    const unsubscribe = subscribeSettingsReveal((then) => {
      reveal = then;
    });

    expect(redirectSystemPath({ path, initial: false })).toBeNull();
    expect(mockRouter.navigate).not.toHaveBeenCalled();

    reveal?.();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: "/(tabs)/settings",
      params: { path: encodeURIComponent(webPath), at: "1" },
    });
    unsubscribe();
  });

  it("콜드 스타트라도 설정이 아닌 링크는 시작 탭을 바꾸지 않는다", () => {
    redirectSystemPath({ path: "focusmakers://social/join?code=4680", initial: true });
    expect(takeInitialActiveRoute()).toBe("index");
  });

  it("가리는 레이아웃이 없어도 프로필 링크는 그 경로 화면이 없어 설정 탭 대상으로 연다", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1);
    mockRouter.navigate.mockClear();

    expect(redirectSystemPath({ path: "focusmakers://profile", initial: false })).toBeNull();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: "/(tabs)/settings",
      params: { path: encodeURIComponent("/profile"), at: "1" },
    });
  });

  it("설정 칸을 가리는 레이아웃이 없으면 설정 링크를 그대로 보낸다", () => {
    const path = "focusmakers://settings";
    expect(redirectSystemPath({ path, initial: false })).toBe(path);
  });
});
