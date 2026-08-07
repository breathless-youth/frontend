import { describe, expect, it, vi } from "vitest";

import * as Sentry from "@sentry/react";

import { reportHandled } from "@/lib/sentry";

/**
 * 기존 `sentry.test.ts`에 얹지 않고 새 파일인 이유: 그쪽은 실제 모듈로 스크러빙 콜백을
 * 검증하는데, 여기의 `vi.mock`이 파일 단위로 걸리면 그 테스트들이 mock을 보게 된다.
 */
vi.mock("@sentry/react", async (importOriginal) => ({
  // `typeof Sentry`는 타입 위치 참조라 컴파일 시 지워진다 — vi.mock 호이스팅 제약과 무관.
  ...(await importOriginal<typeof Sentry>()),
  captureException: vi.fn(),
}));

describe("reportHandled", () => {
  it("console.warn을 유지하면서 warning 레벨 + handled_at 태그로 전송한다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = new Error("모델 로드 실패");

    reportHandled(error, "vision-runtime-load");

    expect(warn).toHaveBeenCalledWith("[vision-runtime-load]", error);
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      level: "warning",
      tags: { handled_at: "vision-runtime-load" },
    });
    warn.mockRestore();
  });
});
