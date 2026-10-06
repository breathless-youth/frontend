import { redirectSystemPath } from "../app/+native-intent";
import { setSessionInviteHandler } from "../lib/sessionInvite";

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
});
