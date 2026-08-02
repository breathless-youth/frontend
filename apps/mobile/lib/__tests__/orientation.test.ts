/**
 * 화면 방향 잠금(`lib/orientation.ts`) — 핵심은 **구형 Dev Client에서 죽지 않는 것**이다.
 *
 * expo-screen-orientation은 네이티브 모듈이라 재빌드 전 빌드에는 존재하지 않는다. 이때
 * 패키지를 require하면 모듈 평가가 동기로 던지는데, Metro 런타임(`guardedLoadModule`)이
 * 그 예외를 호출자의 try/catch보다 먼저 가로채 `ErrorUtils.reportFatalError`로 보내므로
 * **try/catch로도 못 잡고 레드 스크린이 된다**(2026-08-01 실기기 — "Cannot find native
 * module 'ExpoScreenOrientation'" Uncaught, 스택 최상단이 try 안의 require 줄).
 *
 * 그래서 구현은 `requireOptionalNativeModule`로 존재를 먼저 조사하고 **없으면 require 자체를
 * 안 한다** — 여기서 그 계약을 고정한다.
 */

describe("orientation — 네이티브 모듈이 있는 빌드", () => {
  it("lockPortrait는 PORTRAIT_UP으로, unlockForSession은 DEFAULT로 잠근다", () => {
    jest.isolateModules(() => {
      jest.doMock("expo-modules-core", () => ({
        requireOptionalNativeModule: jest.fn(() => ({})),
      }));
      const lockAsync = jest.fn(async () => undefined);
      jest.doMock("expo-screen-orientation", () => ({
        lockAsync,
        OrientationLock: { PORTRAIT_UP: "PORTRAIT_UP", DEFAULT: "DEFAULT" },
      }));

      /* eslint-disable @typescript-eslint/no-require-imports -- isolateModules 안에서는 동적 require만 가능 */
      const { lockPortrait, unlockForSession } =
        require("../orientation") as typeof import("../orientation");
      /* eslint-enable @typescript-eslint/no-require-imports */

      lockPortrait();
      expect(lockAsync).toHaveBeenLastCalledWith("PORTRAIT_UP");

      unlockForSession();
      expect(lockAsync).toHaveBeenLastCalledWith("DEFAULT");
    });
  });

  it("호출 층이 동기로 던져도 앱이 죽지 않는다 — .catch가 붙기 전의 예외", () => {
    jest.isolateModules(() => {
      jest.doMock("expo-modules-core", () => ({
        requireOptionalNativeModule: jest.fn(() => ({})),
      }));
      jest.doMock("expo-screen-orientation", () => ({
        lockAsync: () => {
          throw new Error("half-loaded proxy");
        },
        OrientationLock: { PORTRAIT_UP: "PORTRAIT_UP", DEFAULT: "DEFAULT" },
      }));
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

      /* eslint-disable @typescript-eslint/no-require-imports -- isolateModules 안에서는 동적 require만 가능 */
      const { lockPortrait, unlockForSession } =
        require("../orientation") as typeof import("../orientation");
      /* eslint-enable @typescript-eslint/no-require-imports */

      expect(() => {
        lockPortrait();
        unlockForSession();
      }).not.toThrow();

      warn.mockRestore();
    });
  });
});

describe("orientation — 네이티브 모듈이 없는 구형 빌드", () => {
  it("패키지를 require조차 하지 않는다 — Metro가 팩토리 예외를 가로채 레드 스크린을 만들기 때문", () => {
    jest.isolateModules(() => {
      jest.doMock("expo-modules-core", () => ({
        requireOptionalNativeModule: jest.fn(() => null),
      }));
      // require되는 순간 던지는 목 — 실기기의 구형 빌드와 같은 동작. 구현이 존재 조사 없이
      // require부터 하면 이 테스트가 그 자리에서 터진다.
      jest.doMock("expo-screen-orientation", () => {
        throw new Error("Cannot find native module 'ExpoScreenOrientation'");
      });
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

      /* eslint-disable @typescript-eslint/no-require-imports -- isolateModules 안에서는 동적 require만 가능 */
      const { lockPortrait, unlockForSession } =
        require("../orientation") as typeof import("../orientation");
      /* eslint-enable @typescript-eslint/no-require-imports */

      expect(() => {
        lockPortrait();
        unlockForSession();
        // 경고는 최초 1회만 — 잠금·해제가 화면 전환마다 불리므로 매번 찍으면 콘솔이 잠긴다.
        lockPortrait();
      }).not.toThrow();

      expect(
        warn.mock.calls.filter(([msg]) => String(msg).includes("네이티브 모듈 없음")),
      ).toHaveLength(1);
      warn.mockRestore();
    });
  });
});
