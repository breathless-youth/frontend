import { afterEach, describe, expect, it, vi } from "vitest";

import { initGA4, sanitizePagePath, trackPageView } from "../analytics";

const gaScript = () =>
  document.head.querySelector('script[src^="https://www.googletagmanager.com/gtag/js"]');

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.gtag;
  delete window.dataLayer;
  gaScript()?.remove();
});

describe("initGA4", () => {
  it("측정 ID가 없으면 아무것도 하지 않는다", () => {
    initGA4();

    expect(window.gtag).toBeUndefined();
    expect(window.dataLayer).toBeUndefined();
    expect(gaScript()).toBeNull();
  });

  it("측정 ID가 있으면 js·config 명령을 쌓고 gtag.js 스크립트를 주입한다", () => {
    vi.stubEnv("VITE_GA4_MEASUREMENT_ID", "G-TEST1234");

    initGA4();

    expect(window.dataLayer).toHaveLength(2);
    const config = Array.from(window.dataLayer![1] as ArrayLike<unknown>);
    expect(config).toEqual(["config", "G-TEST1234", { send_page_view: false }]);
    expect(gaScript()).not.toBeNull();
  });

  it("중복 호출해도 스크립트를 한 번만 주입한다", () => {
    vi.stubEnv("VITE_GA4_MEASUREMENT_ID", "G-TEST1234");

    initGA4();
    initGA4();

    expect(window.dataLayer).toHaveLength(2);
    expect(
      document.head.querySelectorAll('script[src^="https://www.googletagmanager.com/gtag/js"]'),
    ).toHaveLength(1);
  });
});

describe("sanitizePagePath", () => {
  it("userId 등 화이트리스트 밖 쿼리 파라미터를 제거한다", () => {
    expect(sanitizePagePath("/records", "?userId=42")).toBe("/records");
    expect(sanitizePagePath("/home", "?userId=42&foo=bar")).toBe("/home");
  });

  it("화이트리스트 파라미터(appVersion·detector)는 유지한다", () => {
    expect(sanitizePagePath("/home", "?userId=42&appVersion=1.0.0")).toBe("/home?appVersion=1.0.0");
    expect(sanitizePagePath("/room/7", "?detector=mock&userId=42")).toBe("/room/:id?detector=mock");
  });

  it("숫자 경로 세그먼트를 :id로 템플릿화한다", () => {
    expect(sanitizePagePath("/room/12345/result", "")).toBe("/room/:id/result");
  });
});

describe("trackPageView", () => {
  it("GA4 미초기화 상태에서는 조용히 무시한다", () => {
    expect(() => trackPageView("/records", "")).not.toThrow();
  });

  it("초기화 후 정제된 경로로 page_view를 보낸다 — userId는 어디에도 남지 않는다", () => {
    vi.stubEnv("VITE_GA4_MEASUREMENT_ID", "G-TEST1234");
    initGA4();

    trackPageView("/room/42/result", "?userId=7&appVersion=1.0.0");

    const last = Array.from(window.dataLayer!.at(-1) as ArrayLike<unknown>);
    expect(last[0]).toBe("event");
    expect(last[1]).toBe("page_view");
    const payload = last[2] as Record<string, string>;
    expect(payload.page_path).toBe("/room/:id/result?appVersion=1.0.0");
    expect(payload.page_location).toBe(
      window.location.origin + "/room/:id/result?appVersion=1.0.0",
    );
    expect(JSON.stringify(payload)).not.toContain("userId");
  });
});
