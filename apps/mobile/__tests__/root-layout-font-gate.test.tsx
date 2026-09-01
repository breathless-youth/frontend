import { render } from "@testing-library/react-native";
import type { ReactNode } from "react";

import RootLayout from "../app/_layout";

/**
 * 라우트 컨텍스트 격리 이유는 `permission-denied.test.tsx` 상단 주석 참고 — `app/` 밖(`__tests__/`)에 둔다.
 *
 * `useFonts`(expo-font)는 `[loaded, error]`를 돌려준다. 로드 **실패**해도 `loaded`는 계속
 * `false`고 `error`만 채워지는데, `error`를 버리고 `!fontsLoaded`만 렌더 게이트로 쓰면 실패
 * 시 스플래시가 영영 안 걷히고 화면도 영원히 null이 된다 — 이 계약(로딩/성공/실패 세 갈래)을
 * 고정한다.
 */

jest.mock("../global.css", () => ({}), { virtual: true });

jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  wrap: (component: unknown) => component,
}));

const mockUseFonts = jest.fn();
jest.mock("expo-font", () => ({
  useFonts: () => mockUseFonts() as [boolean, Error | undefined],
}));

const mockHideAsync = jest.fn();
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: () => mockHideAsync(),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
  Stack: Object.assign(({ children }: { children?: ReactNode }) => children, {
    Screen: () => null,
  }),
}));

// 이 테스트의 관심사는 폰트/스플래시 게이팅뿐이다 — 유저 등록·딥링크·방향 잠금은 각자
// 전용 테스트(`lib/__tests__/*`)가 있으므로 여기서는 부작용 없이 넘어가게만 둔다.
jest.mock("../lib/installReferrerInvite", () => ({
  consumePendingInviteRoute: jest.fn(() => Promise.resolve(null)),
}));
jest.mock("../lib/orientation", () => ({
  lockPortrait: jest.fn(),
  unlockForSession: jest.fn(),
}));
jest.mock("../lib/userApi", () => ({
  ensureUserRegistered: jest.fn(() => Promise.resolve(null)),
}));

beforeEach(() => {
  mockUseFonts.mockReset();
  mockHideAsync.mockClear();
});

describe("RootLayout 폰트 로드 게이팅", () => {
  it("로딩 중([false, undefined])에는 아무것도 그리지 않고 스플래시도 걷지 않는다", () => {
    mockUseFonts.mockReturnValue([false, undefined]);

    const { toJSON } = render(<RootLayout />);

    expect(toJSON()).toBeNull();
    expect(mockHideAsync).not.toHaveBeenCalled();
  });

  it("성공([true, undefined])하면 앱 콘텐츠를 그리고 스플래시를 걷는다", () => {
    mockUseFonts.mockReturnValue([true, undefined]);

    const { toJSON } = render(<RootLayout />);

    expect(toJSON()).not.toBeNull();
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
  });

  it("실패([false, Error])해도 시스템 폰트로 그리고 스플래시를 걷는다 — 벽돌 방지", () => {
    mockUseFonts.mockReturnValue([false, new Error("font load failed")]);

    const { toJSON } = render(<RootLayout />);

    expect(toJSON()).not.toBeNull();
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
  });
});
