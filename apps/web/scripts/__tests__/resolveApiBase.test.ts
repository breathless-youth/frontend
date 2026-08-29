import { describe, expect, it } from "vitest";

import { assertNotProdApiHost, resolveApiBase, resolveDeployEnv } from "../resolveApiBase.js";

describe("resolveDeployEnv", () => {
  it("VITE_DEPLOY_ENV가 VERCEL_ENV보다 우선한다", () => {
    expect(resolveDeployEnv({ VITE_DEPLOY_ENV: "production", VERCEL_ENV: "preview" })).toBe(
      "production",
    );
  });

  it("둘 다 없거나 모르는 값이면 development다", () => {
    expect(resolveDeployEnv({})).toBe("development");
    expect(resolveDeployEnv({ VERCEL_ENV: "staging" })).toBe("development");
  });
});

describe("resolveApiBase", () => {
  it("대시보드 값이 있으면 매핑보다 우선한다 — 운영 무중단", () => {
    const { apiBase } = resolveApiBase({
      VERCEL_ENV: "production",
      VITE_API_BASE_URL: "https://api.sunqstudio.kr",
    });
    expect(apiBase).toBe("https://api.sunqstudio.kr");
  });

  it("preview는 개발 API로 간다", () => {
    const { apiBase } = resolveApiBase({ VERCEL_ENV: "preview" });
    expect(apiBase).toBe("https://api-dev.focusmakers.app");
  });

  it("development는 빈 값이다 — 로컬은 프록시 경유", () => {
    expect(resolveApiBase({}).apiBase).toBe("");
  });
});

describe("가드", () => {
  it("production인데 주소가 개발 API면 던진다", () => {
    expect(() =>
      resolveApiBase({
        VERCEL_ENV: "production",
        VITE_API_BASE_URL: "https://api-dev.focusmakers.app",
      }),
    ).toThrow(/운영/);
  });

  // 빈 값 케이스는 못 만든다 — VITE_API_BASE_URL이 falsy면 매핑이 운영 주소를 채운다.
  // fail-closed는 아래 "호스트를 뽑을 수 없는 값" 케이스가 증명한다.
  it("production인데 호스트를 뽑을 수 없는 값이면 던진다 — fail-closed", () => {
    expect(() => resolveApiBase({ VERCEL_ENV: "production", VITE_API_BASE_URL: "%%%" })).toThrow(
      /운영/,
    );
  });

  it.each(["https://api.sunqstudio.kr", "https://api.focusmakers.app"])(
    "production에서 신·구 운영 호스트(%s)는 통과한다",
    (url) => {
      expect(() =>
        resolveApiBase({ VERCEL_ENV: "production", VITE_API_BASE_URL: url }),
      ).not.toThrow();
    },
  );

  it.each([
    "https://api.sunqstudio.kr",
    "https://api.focusmakers.app",
    "api.focusmakers.app",
    "api.focusmakers.app:443",
    "https://api.focusmakers.app.",
  ])("preview에서 운영 호스트(%s)면 던진다", (url) => {
    expect(() => resolveApiBase({ VERCEL_ENV: "preview", VITE_API_BASE_URL: url })).toThrow(/운영/);
  });

  it("preview에서 호스트를 뽑을 수 없는 값은 통과한다 — 형식 검증은 가드의 일이 아니다", () => {
    expect(() => resolveApiBase({ VERCEL_ENV: "preview", VITE_API_BASE_URL: "%%%" })).not.toThrow();
  });
});

describe("assertNotProdApiHost", () => {
  it.each(["https://api.sunqstudio.kr", "api.sunqstudio.kr:443"])(
    "운영 호스트(%s)면 던진다",
    (url) => {
      expect(() => assertNotProdApiHost("DEV_API_PROXY_TARGET", url)).toThrow(/운영/);
    },
  );

  it("개발 주소·빈 값은 통과한다", () => {
    expect(() =>
      assertNotProdApiHost("DEV_API_PROXY_TARGET", "http://localhost:8080"),
    ).not.toThrow();
    expect(() => assertNotProdApiHost("DEV_API_PROXY_TARGET", undefined)).not.toThrow();
  });
});
