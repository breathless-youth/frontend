import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  androidIntentUrl,
  appSchemeUrl,
  isInAppBrowser,
  openInApp,
  shouldAutoOpenInApp,
} from "../appHandoff";
import { storeLink } from "../storeLink";

describe("appSchemeUrl", () => {
  it("코드가 있으면 focusmakers 스킴 딥링크를 만든다", () => {
    expect(appSchemeUrl("1234")).toBe("focusmakers://social/join?code=1234");
  });

  it("코드가 없으면 쿼리 없이 만든다", () => {
    expect(appSchemeUrl("")).toBe("focusmakers://social/join");
  });
});

describe("androidIntentUrl", () => {
  it("intent 문법에 스킴·패키지·스토어 폴백을 싣는다", () => {
    const fallback = encodeURIComponent(storeLink("android", "1234"));
    expect(androidIntentUrl("1234")).toBe(
      `intent://social/join?code=1234#Intent;scheme=focusmakers;package=com.breathlessyouth.mobile;S.browser_fallback_url=${fallback};end`,
    );
  });
});

describe("isInAppBrowser", () => {
  it("카카오톡·인스타그램 인앱 UA를 참으로 본다", () => {
    expect(isInAppBrowser("Mozilla/5.0 (iPhone) ... KAKAOTALK 10.5.0")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (iPhone) ... Instagram 300.0")).toBe(true);
  });

  it("일반 Safari·Chrome은 거짓으로 본다", () => {
    expect(
      isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1"),
    ).toBe(false);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 14) Chrome/120.0")).toBe(false);
  });
});

describe("shouldAutoOpenInApp", () => {
  it("인앱 브라우저 + 코드 있으면 참", () => {
    expect(shouldAutoOpenInApp("... KAKAOTALK", "1234")).toBe(true);
  });
  it("코드가 없으면 거짓", () => {
    expect(shouldAutoOpenInApp("... KAKAOTALK", "")).toBe(false);
  });
  it("일반 브라우저면 거짓", () => {
    expect(shouldAutoOpenInApp("Safari/604.1", "1234")).toBe(false);
  });
});

describe("openInApp", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("Android는 intent URL로 한 번 이동한다", () => {
    const navigate = vi.fn();
    openInApp("android", "1234", { navigate });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(androidIntentUrl("1234"));
  });

  it("iOS는 스킴을 먼저 열고, 앱 전환이 없으면 1.5초 뒤 스토어로 폴백한다", () => {
    const navigate = vi.fn();
    openInApp("ios", "1234", { navigate });
    expect(navigate).toHaveBeenNthCalledWith(1, appSchemeUrl("1234"));
    vi.advanceTimersByTime(1500);
    expect(navigate).toHaveBeenNthCalledWith(2, storeLink("ios", "1234"));
  });

  it("iOS에서 앱으로 전환되면(pagehide) 스토어 폴백을 취소한다", () => {
    const navigate = vi.fn();
    openInApp("ios", "1234", { navigate });
    window.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(5000);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(appSchemeUrl("1234"));
  });

  it("iOS에서 앱으로 전환되면(visibilitychange hidden) 스토어 폴백을 취소한다", () => {
    const navigate = vi.fn();
    openInApp("ios", "1234", { navigate });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(5000);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(appSchemeUrl("1234"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
});
