import appConfig from "../../app.json";

/**
 * ATS(App Transport Security) 설정 가드.
 *
 * `extra.apiBaseUrl`이 평문 HTTP + IP 리터럴(`http://52.78.219.53:8080`)이라 iOS에서는 ATS
 * 예외 없이 API가 통째로 막힌다. 그 예외가 **효력을 잃는 조합**이 존재하고, 그때의 실패가
 * 조용해서 테스트로 못 박는다.
 *
 * ## 왜 조용히 틀리는가
 *
 * ATS에 막히면 `fetch`가 던지고, `ensureUserRegistered`는 그 예외를 삼켜 `null`을 돌려준다
 * (실패해도 앱을 죽이지 않는 게 의도된 계약이다 — `userApi.ts`). 그러면 세션 URL에 `userId`가
 * 붙지 않고 제출이 통째로 빠지는데, **화면에는 아무 에러도 뜨지 않는다.** 앱은 정상으로 보이고
 * 세션도 정상으로 돌아간다. 2026-07-29 iOS 실기기에서 실제로 이 상태였다.
 */
describe("app.json ATS 설정", () => {
  // 백엔드 HTTPS 전환(2026-08-02) 후 ATS 블록 자체를 제거했다 — 키가 없는 상태가 정상이다.
  // 누군가 평문 HTTP로 되돌리면 아래 두 번째 테스트가 예외 추가를 다시 요구한다.
  const ats = ((appConfig.expo.ios.infoPlist as Record<string, unknown>).NSAppTransportSecurity ??
    {}) as Record<string, unknown>;

  /**
   * iOS 10부터 아래 세 키 중 **하나라도 있으면 `NSAllowsArbitraryLoads`는 무시된다.**
   * 세분화된 키가 우선하고, `NSAllowsArbitraryLoads`는 iOS 9 하위호환용으로만 남는다.
   *
   * 그래서 로컬 서버용으로 `NSAllowsLocalNetworking`을 넣어둔 채 API용으로
   * `NSAllowsArbitraryLoads`를 추가하면 **후자가 통째로 무효가 된다** — plist에는 분명히
   * 들어가 있고 빌드도 정상이라, 설정을 눈으로 봐서는 틀린 걸 알 수 없다.
   */
  const KEYS_THAT_DISABLE_ARBITRARY_LOADS = [
    "NSAllowsLocalNetworking",
    "NSAllowsArbitraryLoadsInWebContent",
    "NSAllowsArbitraryLoadsForMedia",
  ];

  it("NSAllowsArbitraryLoads를 무효화하는 키와 함께 쓰지 않는다", () => {
    if (ats.NSAllowsArbitraryLoads !== true) {
      return; // 평문 HTTP를 끊었다면(= 백엔드 HTTPS 전환) 이 규칙은 무의미하다.
    }
    for (const key of KEYS_THAT_DISABLE_ARBITRARY_LOADS) {
      expect(ats).not.toHaveProperty(key);
    }
  });

  /**
   * 로컬 lighttpd 서버는 `127.0.0.1` 루프백이라 ATS 적용 대상이 아니고,
   * `NSAllowsArbitraryLoads: true`가 그 위에 상위집합으로 얹힌다 — 따로 열 필요가 없다.
   */
  it("평문 HTTP API를 쓰는 동안에는 ATS 예외가 있어야 한다", () => {
    const apiBaseUrl = appConfig.expo.extra.apiBaseUrl;
    if (apiBaseUrl.startsWith("https://")) {
      // 백엔드에 도메인 + HTTPS가 붙으면 ATS 예외를 통째로 지워야 한다 —
      // `NSAllowsArbitraryLoads`를 남긴 채 App Store에 제출하면 심사에서 사유 소명을 요구받는다.
      expect(ats.NSAllowsArbitraryLoads).not.toBe(true);
      return;
    }
    expect(ats.NSAllowsArbitraryLoads).toBe(true);
  });
});
