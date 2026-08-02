import { afterEach, describe, expect, it, vi } from "vitest";

import { initGA4, trackPageView } from "../analytics";

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

describe("trackPageView", () => {
  it("GA4 미초기화 상태에서는 조용히 무시한다", () => {
    expect(() => trackPageView("/records")).not.toThrow();
  });

  it("초기화 후 page_view 이벤트를 경로와 함께 보낸다", () => {
    vi.stubEnv("VITE_GA4_MEASUREMENT_ID", "G-TEST1234");
    initGA4();

    trackPageView("/records?month=2026-08");

    const last = Array.from(window.dataLayer!.at(-1) as ArrayLike<unknown>);
    expect(last[0]).toBe("event");
    expect(last[1]).toBe("page_view");
    expect(last[2]).toMatchObject({ page_path: "/records?month=2026-08" });
  });
});
